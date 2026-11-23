import uuid
from django.db import models
from django.conf import settings


class PrintHost(models.Model):
    """Print host (printer server) connected to physical printer."""
    name = models.CharField(max_length=100)
    api_url = models.URLField(help_text="Base URL of the print host API (e.g., http://192.168.1.50:8001)")
    api_key = models.CharField(max_length=64, help_text="API key for host authentication")
    is_active = models.BooleanField(default=True)
    location = models.CharField(max_length=200, blank=True)
    capabilities = models.JSONField(default=dict, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Document(models.Model):
    PAPER_SIZES = [
        ('A4', 'A4 (210 x 297 mm)'),
        ('A3', 'A3 (297 x 420 mm)'),
        ('A5', 'A5 (148 x 210 mm)'),
        ('Letter', 'Letter (8.5 x 11 in)'),
        ('Legal', 'Legal (8.5 x 14 in)'),
        ('Tabloid', 'Tabloid (11 x 17 in)'),
    ]

    COLOR_MODES = [
        ('bw', 'Black & White'),
        ('color', 'Color'),
    ]

    ORIENTATIONS = [
        ('portrait', 'Portrait'),
        ('landscape', 'Landscape'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending Payment'),
        ('paid', 'Paid - Ready to Print'),
        ('queued', 'Queued for Printing'),
        ('printing', 'Printing'),
        ('printed', 'Printed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_batch_id = models.UUIDField(null=True, blank=True, db_index=True, help_text="Batch identifier for simultaneous multiple document uploads")
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='documents/%Y/%m/%d/')
    file_size = models.PositiveIntegerField(help_text='File size in bytes')
    original_filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    total_pages = models.PositiveIntegerField(default=1, help_text="Total number of pages in original document")

    paper_size = models.CharField(max_length=20, choices=PAPER_SIZES, default='A4')
    color_mode = models.CharField(max_length=10, choices=COLOR_MODES, default='bw')
    orientation = models.CharField(max_length=10, choices=ORIENTATIONS, default='portrait')
    copies = models.PositiveIntegerField(default=1)
    double_sided = models.BooleanField(default=False)
    page_range = models.CharField(max_length=100, blank=True, help_text='e.g., 1-5, 7, 10-12')

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_transaction_id = models.CharField(max_length=100, blank=True)
    payment_verified_at = models.DateTimeField(null=True, blank=True)

    share_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    expires_at = models.DateTimeField(null=True, blank=True)

    # Print host assignment
    print_host = models.ForeignKey(
        'PrintHost',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents',
        help_text="Print host assigned to process this job"
    )
    host_job_id = models.CharField(max_length=100, blank=True, help_text="Job ID on the print host")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    printed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['share_token']),
            models.Index(fields=['order_batch_id']),
            models.Index(fields=['status']),
            models.Index(fields=['print_host', 'status']),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

    @property
    def is_shareable(self):
        return self.status in ['pending', 'paid']

    @property
    def share_url(self):
        return f"/share/{self.share_token}/"

    def parse_page_range(self):
        """Parse page_range string into list of 1-indexed page numbers."""
        if not self.page_range or not self.page_range.strip():
            return list(range(1, max(1, self.total_pages) + 1))

        selected = set()
        parts = [p.strip() for p in self.page_range.split(',') if p.strip()]
        for part in parts:
            if '-' in part:
                try:
                    s_str, e_str = part.split('-', 1)
                    s, e = int(s_str), int(e_str)
                    if s <= e:
                        for page_num in range(max(1, s), min(e, max(s, self.total_pages)) + 1):
                            selected.add(page_num)
                except ValueError:
                    pass
            else:
                try:
                    p = int(part)
                    if p >= 1:
                        selected.add(p)
                except ValueError:
                    pass

        return sorted(list(selected)) if selected else list(range(1, max(1, self.total_pages) + 1))

    def get_selected_page_count(self):
        return len(self.parse_page_range())

    def calculate_price(self):
        try:
            cfg = StoreSettings.get_settings()
            base_unit = float(cfg.bw_price_per_page if self.color_mode == 'bw' else cfg.color_price_per_page)
            duplex_discount = float(cfg.duplex_discount_percent) / 100.0
            a3_mult = float(cfg.a3_multiplier)
            legal_mult = float(cfg.legal_multiplier)
        except Exception:
            base_unit = 3.00 if self.color_mode == 'bw' else 9.00
            duplex_discount = 0.15
            a3_mult = 2.0
            legal_mult = 1.4

        # Paper multiplier
        if self.paper_size in ['A3', 'Tabloid']:
            base_unit *= a3_mult
        elif self.paper_size in ['Legal']:
            base_unit *= legal_mult

        pages = max(1, self.get_selected_page_count())

        if self.double_sided:
            sheets = (pages + 1) // 2
            cost_per_copy = (sheets * 2 * base_unit) * (1.0 - duplex_discount)
        else:
            cost_per_copy = pages * base_unit

        total = round(cost_per_copy * max(1, self.copies), 2)
        return max(total, 3.00)


class StoreSettings(models.Model):
    """Store configuration for UPI payment, pricing, and printer routing."""
    store_name = models.CharField(max_length=150, default="PrintShare Store")
    upi_id = models.CharField(max_length=100, default="8617883252@okbizaxis", help_text="Store UPI ID / VPA")
    merchant_name = models.CharField(max_length=150, default="PrintShare", help_text="Payee / Store Business Name")
    bw_price_per_page = models.DecimalField(max_digits=6, decimal_places=2, default=3.00, help_text="Black & white price per page")
    color_price_per_page = models.DecimalField(max_digits=6, decimal_places=2, default=9.00, help_text="Full color price per page")
    duplex_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=15.00, help_text="Discount percent for double-sided printing")
    a3_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=2.00)
    legal_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=1.40)
    require_login_for_upload = models.BooleanField(default=False, help_text="Require user/staff login before accessing upload page")
    auto_verify_payments = models.BooleanField(default=True, help_text="Auto-verify orders when UTR is entered")
    default_print_host = models.ForeignKey(
        'PrintHost',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_for_stores',
        help_text="Default print station to route new jobs"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Store Setting"
        verbose_name_plural = "Store Settings"

    def __str__(self):
        return f"{self.store_name} ({self.upi_id})"

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class PrintJob(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='print_jobs')
    printer_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=Document.STATUS_CHOICES, default='pending')
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    pages_printed = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    # Host-specific fields
    host_job_id = models.CharField(max_length=100, blank=True, help_text="Job ID on the print host")
    host_printer_name = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Print Job for {self.document.title} - {self.get_status_display()}"