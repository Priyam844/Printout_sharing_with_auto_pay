import uuid
import json
from rest_framework import viewsets, status, generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from rest_framework.authentication import SessionAuthentication, BasicAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # To not perform the csrf check

from .models import Document, PrintJob, PrintHost, StoreSettings
from .serializers import (
    DocumentSerializer,
    DocumentCreateSerializer,
    DocumentShareSerializer,
    PrintJobSerializer,
    PrintHostSerializer,
    StoreSettingsSerializer,
)
from .upi_qr import generate_upi_qr_for_document, verify_upi_payment, generate_upi_qr_for_batch
from .print_service import print_document


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_serializer_class(self):
        if self.action == 'create':
            return DocumentCreateSerializer
        elif self.action == 'retrieve' and 'token' in self.kwargs:
            return DocumentShareSerializer
        return DocumentSerializer

    def get_queryset(self):
        if self.action == 'retrieve' and 'token' in self.kwargs:
            return Document.objects.filter(share_token=self.kwargs['token'])
        return Document.objects.all()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        response_serializer = DocumentSerializer(document, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        if 'token' in kwargs:
            document = get_object_or_404(Document, share_token=kwargs['token'])
            serializer = DocumentShareSerializer(document, context={'request': request})
            return Response(serializer.data)
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def verify_payment(self, request, pk=None):
        document = self.get_object()

        if document.status != 'pending':
            return Response(
                {'error': 'Payment already processed or document not in pending state'},
                status=status.HTTP_400_BAD_REQUEST
            )

        transaction_id = request.data.get('transaction_id')
        if not transaction_id:
            return Response(
                {'error': 'Transaction ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if verify_upi_payment(transaction_id, document.payment_amount, document.id):
            with transaction.atomic():
                # Assign print host (use first active host for now, or allow selection)
                print_host = PrintHost.objects.filter(is_active=True).first()
                if not print_host:
                    return Response(
                        {'error': 'No active print host available'},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE
                    )

                document.status = 'paid'
                document.payment_transaction_id = transaction_id
                document.payment_verified_at = timezone.now()
                document.print_host = print_host
                document.save(update_fields=['status', 'payment_transaction_id', 'payment_verified_at', 'print_host'])

                # Create print job with queued status
                print_job = PrintJob.objects.create(
                    document=document,
                    status='queued',
                    printer_name='',
                )

            return Response({
                'status': 'success',
                'message': 'Payment verified. Document queued for printing.',
                'document': DocumentSerializer(document, context={'request': request}).data,
                'print_job': PrintJobSerializer(print_job).data,
            })

        return Response(
            {'error': 'Payment verification failed'},
            status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=['get'])
    def qr_code(self, request, pk=None):
        document = self.get_object()
        qr_data = generate_upi_qr_for_document(document)
        return Response(qr_data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        document = self.get_object()
        if document.status in ['printed', 'printing']:
            return Response(
                {'error': 'Cannot cancel document that is already printed or printing'},
                status=status.HTTP_400_BAD_REQUEST
            )
        document.status = 'cancelled'
        document.save(update_fields=['status'])
        return Response({'status': 'success', 'message': 'Document cancelled'})

    @action(detail=False, methods=['post'], url_path='batch_upload')
    def batch_upload(self, request):
        files = request.FILES.getlist('files')
        if not files:
            single = request.FILES.get('file')
            if single:
                files = [single]
            else:
                files = [v for k, v in request.FILES.items() if hasattr(v, 'read')]

        if not files:
            return Response({'error': 'No files uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        order_batch_id_raw = request.data.get('order_batch_id')
        if order_batch_id_raw:
            try:
                order_batch_id = uuid.UUID(str(order_batch_id_raw))
            except ValueError:
                order_batch_id = uuid.uuid4()
        else:
            order_batch_id = uuid.uuid4()

        meta_json = request.data.get('metadata')
        per_file_meta = {}
        if meta_json:
            try:
                parsed = json.loads(meta_json) if isinstance(meta_json, str) else meta_json
                if isinstance(parsed, list):
                    for idx, m in enumerate(parsed):
                        fn = m.get('filename') or m.get('original_filename') or str(idx)
                        per_file_meta[fn] = m
                elif isinstance(parsed, dict):
                    per_file_meta = parsed
            except Exception:
                pass

        shared_print_host_id = request.data.get('print_host')
        shared_host = None
        if shared_print_host_id:
            shared_host = PrintHost.objects.filter(id=shared_print_host_id, is_active=True).first()

        created_docs = []
        with transaction.atomic():
            for idx, file_obj in enumerate(files):
                m = per_file_meta.get(file_obj.name, per_file_meta.get(str(idx), {}))

                title = m.get('title') or request.data.get('title') or file_obj.name.rsplit('.', 1)[0]
                paper_size = m.get('paper_size') or request.data.get('paper_size') or 'A4'
                color_mode = m.get('color_mode') or request.data.get('color_mode') or 'bw'
                orientation = m.get('orientation') or request.data.get('orientation') or 'portrait'
                copies = int(m.get('copies') or request.data.get('copies') or 1)

                ds_val = m.get('double_sided') if 'double_sided' in m else request.data.get('double_sided')
                double_sided = str(ds_val).lower() in ['true', '1', 'yes']

                page_range = m.get('page_range') or request.data.get('page_range') or ''
                total_pages = int(m.get('total_pages') or 1)

                mime = file_obj.content_type or 'application/octet-stream'
                if total_pages <= 1 and ('pdf' in mime.lower() or file_obj.name.lower().endswith('.pdf')):
                    try:
                        import pypdf
                        reader = pypdf.PdfReader(file_obj)
                        detected = len(reader.pages)
                        if detected > 0:
                            total_pages = detected
                        file_obj.seek(0)
                    except Exception:
                        pass

                doc_host = shared_host
                host_id = m.get('print_host')
                if host_id:
                    h = PrintHost.objects.filter(id=host_id, is_active=True).first()
                    if h:
                        doc_host = h

                doc = Document.objects.create(
                    order_batch_id=order_batch_id,
                    title=title,
                    file=file_obj,
                    file_size=file_obj.size,
                    original_filename=file_obj.name,
                    mime_type=mime,
                    total_pages=total_pages,
                    paper_size=paper_size,
                    color_mode=color_mode,
                    orientation=orientation,
                    copies=copies,
                    double_sided=double_sided,
                    page_range=page_range,
                    print_host=doc_host,
                    status='pending',
                )
                doc.payment_amount = doc.calculate_price()
                doc.save(update_fields=['payment_amount'])
                created_docs.append(doc)

        total_amount = round(sum(d.payment_amount for d in created_docs), 2)
        batch_qr = generate_upi_qr_for_batch(order_batch_id, total_amount, len(created_docs))

        serialized = DocumentSerializer(created_docs, many=True, context={'request': request}).data
        return Response({
            'status': 'success',
            'order_batch_id': str(order_batch_id),
            'count': len(created_docs),
            'total_amount': total_amount,
            'qr_code': batch_qr,
            'documents': serialized,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post', 'patch'], url_path='batch_update')
    def batch_update(self, request):
        updates = request.data.get('documents') or request.data.get('updates')
        ids = request.data.get('ids')
        common = request.data.get('settings') or {}

        updated_docs = []
        with transaction.atomic():
            if updates and isinstance(updates, list):
                for item in updates:
                    doc_id = item.get('id')
                    if not doc_id:
                        continue
                    try:
                        doc = Document.objects.get(id=doc_id)
                    except Document.DoesNotExist:
                        continue

                    for field in ['title', 'paper_size', 'color_mode', 'orientation', 'copies', 'double_sided', 'page_range', 'total_pages']:
                        if field in item:
                            val = item[field]
                            if field == 'copies':
                                val = max(1, int(val))
                            elif field == 'double_sided':
                                val = str(val).lower() in ['true', '1', 'yes']
                            elif field == 'total_pages':
                                val = max(1, int(val))
                            setattr(doc, field, val)

                    if 'print_host' in item:
                        host_id = item['print_host']
                        doc.print_host = PrintHost.objects.filter(id=host_id, is_active=True).first() if host_id else None

                    doc.payment_amount = doc.calculate_price()
                    doc.save()
                    updated_docs.append(doc)
            elif ids and isinstance(ids, list):
                docs = Document.objects.filter(id__in=ids)
                for doc in docs:
                    for field in ['paper_size', 'color_mode', 'orientation', 'copies', 'double_sided', 'page_range']:
                        if field in request.data:
                            val = request.data[field]
                            if field == 'copies':
                                val = max(1, int(val))
                            elif field == 'double_sided':
                                val = str(val).lower() in ['true', '1', 'yes']
                            setattr(doc, field, val)
                        elif field in common:
                            val = common[field]
                            if field == 'copies':
                                val = max(1, int(val))
                            elif field == 'double_sided':
                                val = str(val).lower() in ['true', '1', 'yes']
                            setattr(doc, field, val)

                    if 'print_host' in request.data:
                        host_id = request.data['print_host']
                        doc.print_host = PrintHost.objects.filter(id=host_id, is_active=True).first() if host_id else None
                    elif 'print_host' in common:
                        host_id = common['print_host']
                        doc.print_host = PrintHost.objects.filter(id=host_id, is_active=True).first() if host_id else None

                    doc.payment_amount = doc.calculate_price()
                    doc.save()
                    updated_docs.append(doc)

        serialized = DocumentSerializer(updated_docs, many=True, context={'request': request}).data
        return Response({
            'status': 'success',
            'updated_count': len(updated_docs),
            'documents': serialized,
        })

    @action(detail=False, methods=['get'], url_path='batch/(?P<batch_id>[^/.]+)')
    def batch_details(self, request, batch_id=None):
        docs = Document.objects.filter(order_batch_id=batch_id).order_by('created_at')
        if not docs.exists():
            return Response({'error': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)

        total_amount = round(sum(d.payment_amount for d in docs), 2)
        batch_qr = generate_upi_qr_for_batch(batch_id, total_amount, docs.count())

        statuses = [d.status for d in docs]
        overall_status = 'pending'
        if all(s == 'printed' for s in statuses):
            overall_status = 'printed'
        elif any(s in ['printing', 'queued'] for s in statuses):
            overall_status = 'printing'
        elif all(s in ['paid', 'queued', 'printing', 'printed'] for s in statuses):
            overall_status = 'paid'
        elif all(s == 'cancelled' for s in statuses):
            overall_status = 'cancelled'

        return Response({
            'batch_id': batch_id,
            'count': docs.count(),
            'status': overall_status,
            'total_amount': total_amount,
            'qr_code': batch_qr,
            'documents': DocumentSerializer(docs, many=True, context={'request': request}).data,
        })

    @action(detail=False, methods=['post'], url_path='batch/(?P<batch_id>[^/.]+)/verify_payment')
    def batch_verify_payment(self, request, batch_id=None):
        docs = Document.objects.filter(order_batch_id=batch_id)
        if not docs.exists():
            return Response({'error': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)

        transaction_id = request.data.get('transaction_id')
        if not transaction_id:
            return Response({'error': 'Transaction ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        total_amount = round(sum(d.payment_amount for d in docs), 2)
        if verify_upi_payment(transaction_id, total_amount, batch_id):
            print_host = PrintHost.objects.filter(is_active=True).first()
            if not print_host:
                return Response(
                    {'error': 'No active print host available'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )

            with transaction.atomic():
                updated = []
                for doc in docs:
                    if doc.status == 'pending':
                        doc.status = 'paid'
                        doc.payment_transaction_id = transaction_id
                        doc.payment_verified_at = timezone.now()
                        if not doc.print_host:
                            doc.print_host = print_host
                        doc.save(update_fields=['status', 'payment_transaction_id', 'payment_verified_at', 'print_host'])

                        PrintJob.objects.create(
                            document=doc,
                            status='queued',
                            printer_name='',
                        )
                    updated.append(doc)

            return Response({
                'status': 'success',
                'message': f'Payment verified for {len(updated)} document(s). Queued for printing.',
                'batch_id': batch_id,
                'documents': DocumentSerializer(updated, many=True, context={'request': request}).data,
            })

        return Response({'error': 'Payment verification failed'}, status=status.HTTP_400_BAD_REQUEST)


class DocumentShareView(generics.RetrieveAPIView):
    queryset = Document.objects.all()
    serializer_class = DocumentShareSerializer
    lookup_field = 'share_token'
    lookup_url_kwarg = 'token'


class PrintJobViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PrintJob.objects.all()
    serializer_class = PrintJobSerializer

    def get_queryset(self):
        document_id = self.request.query_params.get('document')
        if document_id:
            return PrintJob.objects.filter(document_id=document_id)
        return PrintJob.objects.all()


class PrintHostViewSet(viewsets.ModelViewSet):
    """API for managing and viewing print hosts."""
    queryset = PrintHost.objects.filter(is_active=True)
    serializer_class = PrintHostSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]


class PrintHostAPIViewSet(viewsets.GenericViewSet):
    """
    API endpoints for print host communication.
    Authenticated via X-Print-Host-Key header.
    """
    permission_classes = []

    def get_host(self, request):
        """Authenticate and return the PrintHost."""
        api_key = request.headers.get('X-Print-Host-Key')
        if not api_key:
            return None
        try:
            host = PrintHost.objects.get(api_key=api_key, is_active=True)
            return host
        except PrintHost.DoesNotExist:
            return None

    @action(detail=False, methods=['get'], url_path='jobs/pending')
    def pending_jobs(self, request):
        """Get pending print jobs for this host."""
        host = self.get_host(request)
        if not host:
            return Response({'error': 'Invalid or missing API key'}, status=status.HTTP_401_UNAUTHORIZED)

        # Update last_seen
        host.last_seen = timezone.now()
        host.save(update_fields=['last_seen'])

        # Get queued jobs for this host
        jobs = Document.objects.filter(
            print_host=host,
            status='queued'
        ).order_by('created_at')

        # Return job data for print host
        jobs_data = []
        for doc in jobs:
            jobs_data.append({
                'id': str(doc.id),
                'job_id': str(doc.id),  # Use document ID as job ID
                'file_url': request.build_absolute_uri(doc.file.url),
                'settings': {
                    'paper_size': doc.paper_size,
                    'color_mode': doc.color_mode,
                    'orientation': doc.orientation,
                    'copies': doc.copies,
                    'double_sided': doc.double_sided,
                    'page_range': doc.page_range,
                },
            })
        
        return Response(jobs_data)

    @action(detail=False, methods=['post'], url_path='jobs/(?P<job_id>[^/.]+)/status')
    def job_status(self, request, job_id=None):
        """Update job status from print host."""
        host = self.get_host(request)
        if not host:
            return Response({'error': 'Invalid or missing API key'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            document = Document.objects.get(id=job_id, print_host=host)
        except Document.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': 'Status required'}, status=status.HTTP_400_BAD_REQUEST)

        valid_statuses = ['downloading', 'printing', 'printed', 'failed']
        if new_status not in valid_statuses:
            return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)

        document.status = new_status
        document.save(update_fields=['status'])

        # Update or create print job
        print_job, created = PrintJob.objects.get_or_create(
            document=document,
            defaults={'status': new_status}
        )
        print_job.status = new_status
        print_job.host_job_id = job_id
        print_job.host_printer_name = request.data.get('printer_name', '')
        print_job.pages_printed = request.data.get('pages_printed', 0)
        if new_status == 'printing' and not print_job.started_at:
            print_job.started_at = timezone.now()
        if new_status in ['printed', 'failed']:
            print_job.completed_at = timezone.now()
        if new_status == 'failed':
            print_job.error_message = request.data.get('error_message', '')
        print_job.save()

        # Update document status
        if new_status == 'printed':
            document.status = 'printed'
            document.printed_at = timezone.now()
            document.save(update_fields=['status', 'printed_at'])
        elif new_status == 'failed':
            document.status = 'failed'
            document.save(update_fields=['status'])

        return Response({'status': 'success'})

    @action(detail=False, methods=['post'], url_path='printer/status')
    def printer_status(self, request):
        """Receive printer status from host."""
        host = self.get_host(request)
        if not host:
            return Response({'error': 'Invalid or missing API key'}, status=status.HTTP_401_UNAUTHORIZED)

        # Update host capabilities
        capabilities = request.data.get('capabilities', {})
        if capabilities:
            host.capabilities = capabilities
            host.save(update_fields=['capabilities'])

        host.last_seen = timezone.now()
        host.save(update_fields=['last_seen'])

        return Response({'status': 'success'})


class LoginView(APIView):
    """Store Owner & Admin login."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = [CsrfExemptSessionAuthentication, BasicAuthentication]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()
        if not username or not password:
            return Response({'error': 'Please provide both username and password.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=username, password=password)
        if user is not None:
            if not user.is_active:
                return Response({'error': 'Your store account is inactive.'}, status=status.HTTP_403_FORBIDDEN)
            login(request, user)
            return Response({
                'success': True,
                'user': {
                    'username': user.username,
                    'is_staff': user.is_staff,
                    'is_superuser': user.is_superuser,
                }
            })
        return Response({'error': 'Invalid store username or password.'}, status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    """Store Owner & Admin logout."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = [CsrfExemptSessionAuthentication, BasicAuthentication]

    def post(self, request):
        logout(request)
        return Response({'success': True})


class CurrentUserView(APIView):
    """Check current authentication status."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = [CsrfExemptSessionAuthentication, BasicAuthentication]

    def get(self, request):
        if request.user.is_authenticated:
            return Response({
                'is_authenticated': True,
                'user': {
                    'username': request.user.username,
                    'is_staff': request.user.is_staff,
                    'is_superuser': request.user.is_superuser,
                }
            })
        return Response({
            'is_authenticated': False,
            'user': None
        })


class StoreSettingsView(APIView):
    """Read and update store configurations (UPI ID, Page Rates, Printer Routing)."""
    authentication_classes = [CsrfExemptSessionAuthentication, BasicAuthentication]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        cfg = StoreSettings.get_settings()
        serializer = StoreSettingsSerializer(cfg)
        return Response(serializer.data)

    def put(self, request):
        return self.patch(request)

    def patch(self, request):
        cfg = StoreSettings.get_settings()
        serializer = StoreSettingsSerializer(cfg, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                'success': True,
                'message': 'Store settings updated successfully.',
                'settings': serializer.data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminDashboardStatsView(APIView):
    """Store Owner management analytics & live print job queue."""
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [CsrfExemptSessionAuthentication, BasicAuthentication]

    def get(self, request):
        total_orders = Document.objects.count()
        paid_docs = Document.objects.filter(status__in=['paid', 'queued', 'printing', 'printed'])
        total_revenue = round(sum(d.payment_amount for d in paid_docs), 2)
        pending_count = Document.objects.filter(status='pending').count()
        queued_count = Document.objects.filter(status='queued').count()
        printed_count = Document.objects.filter(status='printed').count()
        failed_count = Document.objects.filter(status='failed').count()
        active_printers = PrintHost.objects.filter(is_active=True).count()

        recent_docs = Document.objects.all().order_by('-created_at')[:30]
        recent_serialized = DocumentSerializer(recent_docs, many=True, context={'request': request}).data

        printers = PrintHost.objects.all()
        printers_serialized = PrintHostSerializer(printers, many=True).data

        return Response({
            'total_orders': total_orders,
            'total_revenue': total_revenue,
            'pending_count': pending_count,
            'queued_count': queued_count,
            'printed_count': printed_count,
            'failed_count': failed_count,
            'active_printers': active_printers,
            'recent_orders': recent_serialized,
            'printers': printers_serialized,
        })