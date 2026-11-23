import os
import subprocess
import platform
from django.conf import settings


def print_document(document):
    """
    Print a document based on its settings.
    This is a simulation - in production, this would integrate with actual printer APIs
    like CUPS (Linux/macOS), Windows Print API, or cloud printing services.
    """
    file_path = document.file.path
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Document file not found: {file_path}")

    printer_name = get_default_printer()

    if platform.system() == 'Windows':
        return print_windows(file_path, document, printer_name)
    elif platform.system() == 'Linux':
        return print_linux(file_path, document, printer_name)
    elif platform.system() == 'Darwin':
        return print_macos(file_path, document, printer_name)
    else:
        return simulate_print(document, printer_name)


def get_default_printer():
    """Get the default printer name."""
    system = platform.system()
    if system == 'Windows':
        try:
            import win32print
            return win32print.GetDefaultPrinter()
        except ImportError:
            return "Default Printer"
    elif system == 'Linux':
        try:
            result = subprocess.run(['lpstat', '-d'], capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip().split(':')[-1].strip()
        except Exception:
            pass
        return "Default Printer"
    elif system == 'Darwin':
        try:
            result = subprocess.run(['lpstat', '-d'], capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip().split(':')[-1].strip()
        except Exception:
            pass
        return "Default Printer"
    return "Default Printer"


def print_windows(file_path, document, printer_name):
    """Print on Windows using ShellExecute."""
    try:
        import win32api
        import win32print
        import win32con

        printer_handle = win32print.OpenPrinter(printer_name)
        printer_info = win32print.GetPrinter(printer_handle, 2)
        win32print.ClosePrinter(printer_handle)

        print_options = build_print_options(document)

        win32api.ShellExecute(
            0,
            "printto",
            file_path,
            f'"{printer_name}"',
            ".",
            win32con.SW_HIDE
        )

        return {
            'success': True,
            'printer_name': printer_name,
            'pages_printed': estimate_pages(document),
            'method': 'windows_shell',
        }
    except ImportError:
        return simulate_print(document, printer_name)
    except Exception as e:
        raise Exception(f"Windows print failed: {str(e)}")


def print_linux(file_path, document, printer_name):
    """Print on Linux using CUPS (lp command)."""
    try:
        options = build_lp_options(document)
        cmd = ['lp', '-d', printer_name] + options + [file_path]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0:
            job_id = result.stdout.strip().split()[-1] if result.stdout else 'unknown'
            return {
                'success': True,
                'printer_name': printer_name,
                'pages_printed': estimate_pages(document),
                'method': 'cups',
                'job_id': job_id,
            }
        else:
            raise Exception(f"CUPS print failed: {result.stderr}")
    except FileNotFoundError:
        return simulate_print(document, printer_name)
    except Exception as e:
        raise Exception(f"Linux print failed: {str(e)}")


def print_macos(file_path, document, printer_name):
    """Print on macOS using CUPS (lp command)."""
    return print_linux(file_path, document, printer_name)


def build_print_options(document):
    """Build print options for Windows."""
    options = []
    if document.paper_size:
        options.append(f"/p:{document.paper_size}")
    if document.color_mode == 'bw':
        options.append("/c:bw")
    if document.orientation == 'landscape':
        options.append("/o:landscape")
    if document.copies > 1:
        options.append(f"/n:{document.copies}")
    if document.double_sided:
        options.append("/d:duplex")
    return " ".join(options)


def build_lp_options(document):
    """Build lp command options for CUPS."""
    options = []

    paper_size_map = {
        'A4': 'A4',
        'A3': 'A3',
        'A5': 'A5',
        'Letter': 'Letter',
        'Legal': 'Legal',
        'Tabloid': 'Tabloid',
    }
    if document.paper_size in paper_size_map:
        options.extend(['-o', f'media={paper_size_map[document.paper_size]}'])

    if document.color_mode == 'bw':
        options.extend(['-o', 'ColorModel=Gray'])
    else:
        options.extend(['-o', 'ColorModel=RGB'])

    if document.orientation == 'landscape':
        options.extend(['-o', 'orientation-requested=4'])
    else:
        options.extend(['-o', 'orientation-requested=3'])

    if document.copies > 1:
        options.extend(['-n', str(document.copies)])

    if document.double_sided:
        options.extend(['-o', 'sides=two-sided-long-edge'])
    else:
        options.extend(['-o', 'sides=one-sided'])

    if document.page_range:
        options.extend(['-o', f'page-ranges={document.page_range}'])

    return options


def estimate_pages(document):
    """Estimate number of pages based on file size and type."""
    if document.mime_type == 'application/pdf':
        return max(1, document.file_size // 50000)
    elif document.mime_type.startswith('image/'):
        return document.copies
    else:
        return max(1, document.file_size // 10000)


def simulate_print(document, printer_name):
    """Simulate printing for development/testing."""
    import time
    time.sleep(1)

    return {
        'success': True,
        'printer_name': printer_name,
        'pages_printed': estimate_pages(document),
        'method': 'simulation',
        'note': 'Print simulated - no actual printer used',
    }


def get_printer_status(printer_name):
    """Get printer status."""
    system = platform.system()
    if system == 'Windows':
        try:
            import win32print
            printer_handle = win32print.OpenPrinter(printer_name)
            printer_info = win32print.GetPrinter(printer_handle, 2)
            win32print.ClosePrinter(printer_handle)
            return {
                'status': 'ready' if printer_info['Status'] == 0 else 'error',
                'jobs': printer_info['cJobs'],
            }
        except Exception:
            pass
    elif system in ['Linux', 'Darwin']:
        try:
            result = subprocess.run(['lpstat', '-p', printer_name], capture_output=True, text=True)
            return {'status': 'ready' if result.returncode == 0 else 'error', 'output': result.stdout}
        except Exception:
            pass
    return {'status': 'unknown', 'printer': printer_name}