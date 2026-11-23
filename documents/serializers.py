from rest_framework import serializers
from .models import Document, PrintJob, PrintHost, StoreSettings
from .upi_qr import build_upi_string


class DocumentSerializer(serializers.ModelSerializer):
    share_url = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    upi_qr_data = serializers.SerializerMethodField()
    selected_page_count = serializers.SerializerMethodField()
    selected_pages = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'order_batch_id', 'title', 'file', 'file_size', 'original_filename', 'mime_type',
            'total_pages', 'paper_size', 'color_mode', 'orientation', 'copies', 'double_sided', 'page_range',
            'selected_page_count', 'selected_pages',
            'status', 'payment_amount', 'payment_transaction_id', 'payment_verified_at',
            'share_token', 'share_url', 'expires_at', 'created_at', 'updated_at', 'printed_at',
            'price', 'upi_qr_data', 'print_host',
        ]
        read_only_fields = [
            'id', 'file_size', 'original_filename', 'mime_type', 'status',
            'payment_amount', 'payment_transaction_id', 'payment_verified_at',
            'share_token', 'share_url', 'created_at', 'updated_at', 'printed_at',
            'price', 'upi_qr_data', 'selected_page_count', 'selected_pages',
        ]

    def get_share_url(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.share_url)
        return obj.share_url

    def get_price(self, obj):
        return obj.calculate_price()

    def get_selected_page_count(self, obj):
        return obj.get_selected_page_count()

    def get_selected_pages(self, obj):
        return obj.parse_page_range()

    def get_upi_qr_data(self, obj):
        amount = obj.calculate_price()
        return build_upi_string(amount, str(obj.id), f'Print: {obj.title}')


class DocumentCreateSerializer(serializers.ModelSerializer):
    print_host = serializers.PrimaryKeyRelatedField(
        queryset=PrintHost.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    total_pages = serializers.IntegerField(required=False, default=1)
    order_batch_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Document
        fields = [
            'title', 'file', 'order_batch_id', 'total_pages',
            'paper_size', 'color_mode', 'orientation',
            'copies', 'double_sided', 'page_range', 'print_host',
        ]

    def create(self, validated_data):
        print_host = validated_data.pop('print_host', None)
        file_obj = validated_data['file']
        validated_data['original_filename'] = file_obj.name
        validated_data['file_size'] = file_obj.size
        mime = file_obj.content_type or 'application/octet-stream'
        validated_data['mime_type'] = mime

        # Auto-detect total pages if PDF and not explicitly given or default 1
        if 'total_pages' not in validated_data or validated_data['total_pages'] <= 1:
            if 'pdf' in mime.lower() or file_obj.name.lower().endswith('.pdf'):
                try:
                    import pypdf
                    reader = pypdf.PdfReader(file_obj)
                    detected = len(reader.pages)
                    if detected > 0:
                        validated_data['total_pages'] = detected
                    file_obj.seek(0)
                except Exception:
                    pass

        validated_data['payment_amount'] = 0
        if print_host:
            validated_data['print_host'] = print_host
        document = super().create(validated_data)
        document.payment_amount = document.calculate_price()
        document.save(update_fields=['payment_amount'])
        return document


class DocumentShareSerializer(serializers.ModelSerializer):
    price = serializers.SerializerMethodField()
    upi_qr_data = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    selected_page_count = serializers.SerializerMethodField()
    selected_pages = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'order_batch_id', 'title', 'original_filename', 'file_size', 'mime_type',
            'total_pages', 'paper_size', 'color_mode', 'orientation', 'copies', 'double_sided', 'page_range',
            'selected_page_count', 'selected_pages',
            'status', 'payment_amount', 'payment_transaction_id',
            'created_at', 'price', 'upi_qr_data', 'file_url',
        ]
        read_only_fields = fields

    def get_price(self, obj):
        return obj.calculate_price()

    def get_selected_page_count(self, obj):
        return obj.get_selected_page_count()

    def get_selected_pages(self, obj):
        return obj.parse_page_range()

    def get_upi_qr_data(self, obj):
        amount = obj.calculate_price()
        return build_upi_string(amount, str(obj.id), f'Print: {obj.title}')

    def get_file_url(self, obj):
        request = self.context.get('request')
        if request and obj.file:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else None


class PrintJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintJob
        fields = [
            'id', 'document', 'printer_name', 'status',
            'started_at', 'completed_at', 'error_message',
            'pages_printed', 'created_at',
        ]
        read_only_fields = fields


class PrintHostSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintHost
        fields = [
            'id', 'name', 'api_url', 'api_key', 'is_active',
            'location', 'capabilities', 'last_seen',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_seen']
        extra_kwargs = {
            'api_key': {'write_only': True},
        }


class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        fields = '__all__'
        read_only_fields = ['id', 'updated_at']