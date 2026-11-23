import qrcode
import io
import base64
from django.conf import settings
import urllib.parse


def generate_upi_qr(upi_string, size=10, border=4):
    """
    Generate a UPI QR code as base64 encoded PNG image.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=size,
        border=border,
    )
    qr.add_data(upi_string)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)

    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    return f"data:image/png;base64,{img_base64}"


def build_upi_string(amount, transaction_ref, note="PrintShare Payment"):
    """
    Build a UPI payment string for dynamic QR generation.
    """
    try:
        from .models import StoreSettings
        cfg = StoreSettings.get_settings()
        vpa = cfg.upi_id or settings.UPI_MERCHANT_VPA
        name = cfg.merchant_name or settings.UPI_MERCHANT_NAME
    except Exception:
        vpa = getattr(settings, 'UPI_MERCHANT_VPA', '8617883252@okbizaxis')
        name = getattr(settings, 'UPI_MERCHANT_NAME', 'PrintShare')

    return (
        f"upi://pay?pa={vpa}"
        f"&pn={urllib.parse.quote(name)}"
        f"&am={amount}"
        f"&cu=INR"
        f"&tn={urllib.parse.quote(note)}"
        f"&tr={transaction_ref}"
    )


def generate_upi_qr_for_document(document):
    """
    Generate UPI QR code for a document payment.
    """
    amount = document.calculate_price()
    transaction_ref = str(document.id)
    note = f"Print: {document.title}"

    upi_string = build_upi_string(amount, transaction_ref, note)
    qr_base64 = generate_upi_qr(upi_string)

    return {
        'upi_string': upi_string,
        'qr_base64': qr_base64,
        'amount': amount,
        'transaction_ref': transaction_ref,
    }


def generate_upi_qr_for_batch(batch_id, amount, count):
    """
    Generate UPI QR code for a batch of multiple documents.
    """
    transaction_ref = str(batch_id)
    note = f"PrintShare: {count} document(s)"
    upi_string = build_upi_string(amount, transaction_ref, note)
    qr_base64 = generate_upi_qr(upi_string)
    return {
        'upi_string': upi_string,
        'qr_base64': qr_base64,
        'amount': amount,
        'transaction_ref': transaction_ref,
    }


def verify_upi_payment(transaction_id, amount, document_id):
    """
    Verify UPI payment. In production, this would integrate with a payment gateway
    or bank API to verify the transaction. For now, we simulate verification.
    """
    return True