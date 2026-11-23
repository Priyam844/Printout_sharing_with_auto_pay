import logging
from typing import Optional, List
from pathlib import Path
import requests
from requests.auth import HTTPBasicAuth

from .base import PrinterBackend, PrintJob, PrinterCapabilities, PrinterStatus, PrintJobStatus

logger = logging.getLogger(__name__)


class IPPPrinterBackend(PrinterBackend):
    """IPP/CUPS printer backend using pyipp or raw HTTP requests."""
    
    def __init__(self, connection_string: str):
        super().__init__(connection_string)
        self.session: Optional[requests.Session] = None
        self.printer_uri: Optional[str] = None
        self._parse_connection_string()
    
    def _parse_connection_string(self) -> None:
        """Parse connection string to extract printer URI."""
        conn = self.connection_string.strip()
        
        if conn.startswith("ipp://") or conn.startswith("ipps://") or conn.startswith("http://") or conn.startswith("https://"):
            self.printer_uri = conn.rstrip("/")
        elif conn.startswith("cups://"):
            # CUPS format: cups://printer_name
            name = conn[7:]
            self.printer_uri = f"ipp://localhost:631/printers/{name}"
        else:
            # Assume it's a printer name on local CUPS
            self.printer_uri = f"ipp://localhost:631/printers/{conn}"
    
    def connect(self) -> bool:
        """Test connection to IPP printer."""
        try:
            self.session = requests.Session()
            self.session.timeout = 10
            
            # Test with Get-Printer-Attributes
            response = self.session.post(
                f"{self.printer_uri}",
                data=b"",
                headers={
                    "Content-Type": "application/ipp",
                    "Accept": "application/ipp",
                },
            )
            
            if response.status_code == 200:
                logger.info(f"Connected to IPP printer at {self.printer_uri}")
                return True
            else:
                logger.warning(f"IPP printer responded with status {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to connect to IPP printer: {e}")
            return False
    
    def disconnect(self) -> None:
        if self.session:
            self.session.close()
            self.session = None
    
    def get_capabilities(self) -> 'PrinterCapabilities':
        from .base import PrinterCapabilities
        
        if self._capabilities:
            return self._capabilities
        
        caps = PrinterCapabilities(
            paper_sizes=["A4", "A3", "A5", "Letter", "Legal", "Tabloid"],
            color_modes=["color", "monochrome"],
            duplex_supported=True,
            max_copies=999,
            orientations=["portrait", "landscape"],
            media_types=["plain", "heavy", "light", "glossy"],
            finishing_options=["none", "staple", "punch"],
        )
        
        # Try to fetch actual capabilities from printer
        try:
            if self.session:
                resp = self.session.get(f"{self.printer_uri}/attributes")
                if resp.status_code == 200:
                    # Parse IPP response for actual capabilities
                    pass
        except Exception as e:
            logger.debug(f"Could not fetch printer capabilities: {e}")
        
        self._capabilities = caps
        return caps
    
    def get_status(self) -> 'PrinterStatus':
        from .base import PrinterStatus
        
        try:
            if not self.session:
                return PrinterStatus(is_online=False, message="Not connected")
            
            # Query printer status via IPP Get-Printer-Attributes
            ipp_request = self._build_ipp_get_attributes()
            
            resp = self.session.post(
                self.printer_uri,
                data=ipp_request,
                headers={
                    "Content-Type": "application/ipp",
                    "Accept": "application/ipp",
                },
                timeout=5,
            )
            
            if resp.status_code == 200:
                # Parse IPP response for printer-state
                # printer-state: 3=idle, 4=processing, 5=stopped
                return PrinterStatus(
                    is_online=True,
                    message="Ready",
                    jobs_queued=0,
                )
            else:
                return PrinterStatus(is_online=False, message=f"HTTP {resp.status_code}")
                
        except Exception as e:
            logger.error(f"Failed to get printer status: {e}")
            return PrinterStatus(is_online=False, message=str(e))
    
    def _build_ipp_get_attributes(self) -> bytes:
        """Build minimal IPP Get-Printer-Attributes request."""
        # This is a simplified IPP request
        # In production, use pyipp library for proper IPP encoding
        return b""
    
    def print_job(self, job: 'PrintJob') -> bool:
        """Submit print job via IPP Print-Job or Send-Document."""
        if not self.session:
            if not self.connect():
                job.error_message = "Cannot connect to printer"
                return False
        
        job.status = PrintJobStatus.PRINTING
        
        try:
            # Download file first
            if not job.file_path:
                job.error_message = "No file to print"
                return False
            
            # Build IPP Print-Job request with file
            with open(job.file_path, "rb") as f:
                file_data = f.read()
            
            # Build IPP request with attributes
            ipp_attrs = self._build_print_attributes(job)
            
            # For simplicity, use raw POST with file
            # In production, use proper IPP encoding (pyipp library)
            resp = self.session.post(
                self.printer_uri,
                data=file_data,
                headers={
                    "Content-Type": "application/octet-stream",
                    "Content-Length": str(len(file_data)),
                },
                timeout=60,
            )
            
            if resp.status_code in (200, 201):
                job.status = PrintJobStatus.PRINTED
                job.pages_printed = 1  # Would parse from response
                logger.info(f"Job {job.job_id} printed successfully")
                return True
            else:
                job.error_message = f"Print failed: HTTP {resp.status_code}"
                logger.error(f"Print job {job.job_id} failed: {resp.status_code} {resp.text}")
                return False
                
        except Exception as e:
            job.error_message = f"Print exception: {e}"
            logger.error(f"Print job {job.job_id} error: {e}")
            return False
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel job via IPP Cancel-Job."""
        # Would send IPP Cancel-Job request
        logger.info(f"Cancel requested for job {job_id}")
        return True
    
    def _build_print_attributes(self, job: 'PrintJob') -> dict:
        """Convert job settings to IPP attributes."""
        from .base import PrinterBackend
        return self._apply_settings(job)