import json
import uuid
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status
from .models import Document, PrintHost, PrintJob


class DocumentBatchAndPageTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = PrintHost.objects.create(
            name="Main Xerox Shop",
            api_url="http://127.0.0.1:8001",
            api_key="test_api_key_123",
            is_active=True,
            location="Room 101",
        )

    def test_page_range_parsing_and_pricing(self):
        doc = Document.objects.create(
            title="Thesis",
            file=SimpleUploadedFile("thesis.pdf", b"%PDF-1.4 mock pdf content"),
            file_size=100,
            original_filename="thesis.pdf",
            mime_type="application/pdf",
            total_pages=10,
            paper_size="A4",
            color_mode="bw",
            copies=1,
            double_sided=False,
            page_range="1-3, 5",
        )

        selected = doc.parse_page_range()
        self.assertEqual(selected, [1, 2, 3, 5])
        self.assertEqual(doc.get_selected_page_count(), 4)

        # 4 pages * 3.00 (bw A4) * 1 copy = 12.00
        price = doc.calculate_price()
        self.assertEqual(price, 12.00)

        # Test double-sided calculation
        doc.double_sided = True
        # 4 pages on duplex = 2 sheets. (2 sheets * 2 sides * 3.00) * 0.85 = 10.20
        self.assertEqual(doc.calculate_price(), 10.20)

    def test_batch_upload_api(self):
        file1 = SimpleUploadedFile("doc1.txt", b"First doc content", content_type="text/plain")
        file2 = SimpleUploadedFile("doc2.txt", b"Second doc content", content_type="text/plain")

        meta = [
            {"title": "Custom Doc 1", "paper_size": "A4", "color_mode": "bw", "copies": 1, "page_range": "1"},
            {"title": "Custom Doc 2", "paper_size": "A3", "color_mode": "color", "copies": 2, "page_range": "1-2", "total_pages": 2},
        ]

        response = self.client.post(
            "/api/documents/batch_upload/",
            {
                "files": [file1, file2],
                "metadata": json.dumps(meta),
                "print_host": str(self.host.id),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["count"], 2)
        self.assertTrue("order_batch_id" in data)
        batch_id = data["order_batch_id"]

        # Verify documents created in DB
        docs = Document.objects.filter(order_batch_id=batch_id)
        self.assertEqual(docs.count(), 2)
        doc1 = docs.get(title="Custom Doc 1")
        self.assertEqual(doc1.color_mode, "bw")
        self.assertEqual(doc1.paper_size, "A4")

    def test_batch_update_api(self):
        doc1 = Document.objects.create(
            title="D1",
            file=SimpleUploadedFile("d1.txt", b"content"),
            file_size=10,
            original_filename="d1.txt",
            mime_type="text/plain",
            paper_size="A4",
            color_mode="color",
        )
        doc2 = Document.objects.create(
            title="D2",
            file=SimpleUploadedFile("d2.txt", b"content"),
            file_size=10,
            original_filename="d2.txt",
            mime_type="text/plain",
            paper_size="A4",
            color_mode="color",
        )

        response = self.client.post(
            "/api/documents/batch_update/",
            {
                "ids": [str(doc1.id), str(doc2.id)],
                "color_mode": "bw",
                "paper_size": "Letter",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        doc1.refresh_from_db()
        doc2.refresh_from_db()
        self.assertEqual(doc1.color_mode, "bw")
        self.assertEqual(doc1.paper_size, "Letter")
        self.assertEqual(doc2.color_mode, "bw")
        self.assertEqual(doc2.paper_size, "Letter")

    def test_batch_verify_payment(self):
        batch_id = uuid.uuid4()
        doc = Document.objects.create(
            order_batch_id=batch_id,
            title="Batch Item",
            file=SimpleUploadedFile("d.txt", b"content"),
            file_size=10,
            original_filename="d.txt",
            mime_type="text/plain",
            status="pending",
            payment_amount=15.00,
        )

        response = self.client.post(
            f"/api/documents/batch/{batch_id}/verify_payment/",
            {"transaction_id": "TEST_UTR_999"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        doc.refresh_from_db()
        self.assertEqual(doc.status, "paid")
        self.assertEqual(doc.payment_transaction_id, "TEST_UTR_999")
        self.assertEqual(PrintJob.objects.filter(document=doc).count(), 1)
