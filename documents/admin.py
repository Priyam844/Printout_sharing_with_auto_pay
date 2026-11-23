from django.contrib import admin
from .models import Document, PrintJob, PrintHost, StoreSettings


@admin.register(StoreSettings)
class StoreSettingsAdmin(admin.ModelAdmin):
    list_display = ['store_name', 'upi_id', 'bw_price_per_page', 'color_price_per_page', 'require_login_for_upload', 'updated_at']
    fieldsets = (
        ('Store & UPI Info', {'fields': ('store_name', 'upi_id', 'merchant_name')}),
        ('Page Pricing', {'fields': ('bw_price_per_page', 'color_price_per_page', 'duplex_discount_percent', 'a3_multiplier', 'legal_multiplier')}),
        ('Access & Automation', {'fields': ('require_login_for_upload', 'auto_verify_payments', 'default_print_host')}),
    )


@admin.register(PrintHost)
class PrintHostAdmin(admin.ModelAdmin):
    list_display = ['name', 'api_url', 'is_active', 'location', 'last_seen', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'location', 'api_url']
    readonly_fields = ['created_at', 'updated_at', 'last_seen']
    fieldsets = (
        (None, {'fields': ('name', 'api_url', 'api_key', 'is_active', 'location')}),
        ('Capabilities', {'fields': ('capabilities',)}),
        ('Timestamps', {'fields': ('last_seen', 'created_at', 'updated_at'), 'classes': ('collapse',)}),
    )


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['title', 'status', 'paper_size', 'color_mode', 'copies', 'payment_amount', 'print_host', 'created_at']
    list_filter = ['status', 'paper_size', 'color_mode', 'print_host', 'created_at']
    search_fields = ['title', 'original_filename', 'share_token']
    readonly_fields = ['id', 'file_size', 'original_filename', 'mime_type', 'share_token', 'share_url',
                       'payment_amount', 'payment_transaction_id', 'payment_verified_at',
                       'created_at', 'updated_at', 'printed_at']
    fieldsets = (
        (None, {'fields': ('title', 'file', 'original_filename', 'file_size', 'mime_type')}),
        ('Print Settings', {'fields': ('paper_size', 'color_mode', 'orientation', 'copies', 'double_sided', 'page_range')}),
        ('Status & Payment', {'fields': ('status', 'payment_amount', 'payment_transaction_id', 'payment_verified_at')}),
        ('Print Host', {'fields': ('print_host', 'host_job_id')}),
        ('Sharing', {'fields': ('share_token', 'share_url', 'expires_at')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at', 'printed_at'), 'classes': ('collapse',)}),
    )


@admin.register(PrintJob)
class PrintJobAdmin(admin.ModelAdmin):
    list_display = ['id', 'document', 'status', 'printer_name', 'host_printer_name', 'pages_printed', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['document__title', 'host_job_id', 'host_printer_name']
    readonly_fields = ['id', 'document', 'printer_name', 'status', 'started_at', 'completed_at',
                       'error_message', 'pages_printed', 'created_at', 'host_job_id', 'host_printer_name']