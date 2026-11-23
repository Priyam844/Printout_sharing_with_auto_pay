import logging
import os
from typing import Optional, List
from pathlib import Path

from .base import PrinterBackend, PrintJob, PrinterCapabilities, PrinterStatus, PrintJobStatus

logger = logging.getLogger(__name__)


class WindowsPrinterBackend(PrinterBackend):
    """Windows printer backend using win32print/win32api."""
    
    def __init__(self, connection_string: str):
        super().__init__(connection_string)
        self.printer_name: Optional[str] = None
        self._printer_handle = None
        self._parse_connection_string()
    
    def _parse_connection_string(self) -> None:
        """Parse connection string for printer name."""
        conn = self.connection_string.strip()
        
        if conn.startswith("usb://"):
            # usb://Manufacturer/Model
            self.printer_name = conn[6:]
        elif conn.startswith("windows://"):
            self.printer_name = conn[10:]
        else:
            # Assume it's the printer name directly
            self.printer_name = conn
    
    def connect(self) -> bool:
        """Connect to Windows printer."""
        try:
            import win32print
            import win32api
            
            # If no specific printer, use default
            if not self.printer_name:
                self.printer_name = win32print.GetDefaultPrinter()
                logger.info(f"Using default printer: {self.printer_name}")
            
            # Test if printer exists
            printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
            
            if self.printer_name not in printers:
                logger.error(f"Printer '{self.printer_name}' not found. Available: {printers}")
                return False
            
            # Open printer for later use
            self._printer_handle = win32print.OpenPrinter(self.printer_name)
            logger.info(f"Connected to Windows printer: {self.printer_name}")
            return True
            
        except ImportError:
            logger.error("pywin32 not installed. Install with: pip install pywin32")
            return False
        except Exception as e:
            logger.error(f"Failed to connect to Windows printer: {e}")
            return False
    
    def disconnect(self) -> None:
        if self._printer_handle:
            try:
                import win32print
                win32print.ClosePrinter(self._printer_handle)
            except Exception:
                pass
            self._printer_handle = None
    
    def get_capabilities(self) -> 'PrinterCapabilities':
        from .base import PrinterCapabilities
        
        if self._capabilities:
            return self._capabilities
        
        try:
            import win32print
            
            if not self._printer_handle:
                self.connect()
            
            # Get printer info
            pinfo = win32print.GetPrinter(self._printer_handle, 2)
            
            # Get device capabilities
            devmode = pinfo.get("pDevMode")
            
            caps = PrinterCapabilities(
                paper_sizes=["A4", "A3", "A5", "Letter", "Legal", "Tabloid"],
                color_modes=["color", "monochrome"],
                duplex_supported=bool(devmode and getattr(devmode, "Duplex", 0) > 1),
                max_copies=999,
                orientations=["portrait", "landscape"],
                media_types=["plain"],
                finishing_options=["none"],
            )
            
            if devmode:
                # Extract supported paper sizes from devmode
                pass
            
            self._capabilities = caps
            return caps
            
        except Exception as e:
            logger.warning(f"Could not fetch Windows printer capabilities: {e}")
            return PrinterCapabilities(
                paper_sizes=["A4", "A3", "A5", "Letter", "Legal", "Tabloid"],
                color_modes=["color", "monochrome"],
                duplex_supported=True,
                max_copies=999,
                orientations=["portrait", "landscape"],
            )
    
    def get_status(self) -> 'PrinterStatus':
        from .base import PrinterStatus
        
        try:
            import win32print
            
            if not self._printer_handle:
                return PrinterStatus(is_online=False, message="Not connected")
            
            # Get printer status
            pinfo = win32print.GetPrinter(self._printer_handle, 2)
            status = pinfo.get("Status", 0)
            
            # Status flags: https://docs.microsoft.com/en-us/windows/win32/printdocs/printer-info-2
            # 0 = ready, 1 = paused, 2 = error, etc.
            is_online = (status == 0)
            
            status_messages = {
                0: "Ready",
                1: "Paused",
                2: "Error",
                3: "Pending Deletion",
                4: "Paper Jam",
                5: "Paper Out",
                6: "Manual Feed",
                7: "Paper Problem",
                8: "Offline",
                9: "IO Active",
                10: "Busy",
                11: "Printing",
                12: "Output Bin Full",
                13: "Not Available",
                13: "Waiting",
                14: "Processing",
                15: "Initializing",
                16: "Warming Up",
                17: "Toner Low",
                18: "No Toner",
                19: "Page Punt",
                20: "User Intervention Required",
                21: "Out of Memory",
                22: "Door Open",
                23: "Server Unknown",
                24: "Power Save",
            }
            
            return PrinterStatus(
                is_online=is_online,
                message=status_messages.get(status, f"Status: {status}"),
                jobs_queued=pinfo.get("cJobs", 0),
            )
            
        except Exception as e:
            logger.error(f"Failed to get Windows printer status: {e}")
            return PrinterStatus(is_online=False, message=str(e))
    
    def print_job(self, job: 'PrintJob') -> bool:
        """Print job using Windows ShellExecute or win32api."""
        if not self._printer_handle:
            if not self.connect():
                job.error_message = "Cannot connect to printer"
                return False
        
        job.status = PrintJobStatus.PRINTING
        
        try:
            import win32api
            import win32print
            import win32con
            
            if not job.file_path or not os.path.exists(job.file_path):
                job.error_message = "File not found"
                return False
            
            # Apply print settings via DEVMODE
            devmode = self._create_devmode(job)
            
            # Method 1: ShellExecute (simplest, uses default app)
            # For PDFs, this opens the default PDF viewer and prints
            result = win32api.ShellExecute(
                0,
                "printto",
                str(job.file_path),
                f'"{self.printer_name}"',
                ".",
                win32con.SW_HIDE,
            )
            
            if result > 32:
                job.status = PrintJobStatus.PRINTED
                job.pages_printed = 1
                logger.info(f"Job {job.job_id} sent to printer via ShellExecute")
                return True
            else:
                job.error_message = f"ShellExecute failed with code: {result}"
                return False
                
        except Exception as e:
            job.error_message = f"Windows print error: {e}"
            logger.error(f"Print job {job.job_id} error: {e}")
            return False
    
    def _create_devmode(self, job: 'PrintJob'):
        """Create DEVMODE structure with print settings."""
        try:
            import win32print
            import pywintypes
            
            # Get current devmode
            devmode = win32print.GetPrinter(self._printer_handle, 2).get("pDevMode")
            if not devmode:
                devmode = pywintypes.DEVMODEType()
                devmode.DeviceName = self.printer_name[:31]
            
            # Apply settings
            settings = job.settings
            
            # Paper size
            if "paper_size" in settings:
                paper_map = {
                    "A4": 9, "A3": 8, "A5": 11, "Letter": 1, "Legal": 5, "Tabloid": 3
                }
                if settings["paper_size"] in paper_map:
                    devmode.PaperSize = paper_map[settings["paper_size"]]
                    devmode.Fields |= pywintypes.DM_PAPERSIZE
            
            # Orientation
            if "orientation" in settings:
                devmode.Orientation = 2 if settings["orientation"] == "landscape" else 1
                devmode.Fields |= pywintypes.DM_ORIENTATION
            
            # Duplex
            if settings.get("duplex"):
                devmode.Duplex = 2  # DMDUP_VERTICAL
            else:
                devmode.Duplex = 1  # DMDUP_SIMPLEX
            devmode.Fields |= pywintypes.DM_DUPLEX
            
            # Copies
            if "copies" in settings:
                devmode.Copies = min(settings["copies"], 999)
                devmode.Fields |= pywintypes.DM_COPIES
            
            # Color mode
            if "color_mode" in settings:
                devmode.Color = 2 if settings["color_mode"] == "color" else 1
                devmode.Fields |= pywintypes.DM_COLOR
            
            return devmode
            
        except Exception as e:
            logger.warning(f"Could not create DEVMODE: {e}")
            return None
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel job in Windows print queue."""
        try:
            import win32print
            
            jobs = win32print.EnumJobs(self._printer_handle, 0, -1, 1)
            for j in jobs:
                if str(j["JobId"]) == str(job_id):
                    win32print.SetJob(self._printer_handle, j["JobId"], 0, None, win32print.JOB_CONTROL_CANCEL)
                    logger.info(f"Cancelled job {job_id}")
                    return True
            return False
        except Exception as e:
            logger.error(f"Failed to cancel job {job_id}: {e}")
            return False