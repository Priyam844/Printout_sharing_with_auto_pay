import logging
import time
import threading
import hashlib
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import get_config, Config
from printer import PrinterBackend, PrintJob, PrintJobStatus, PrinterStatus
from printer.ipp_client import IPPPrinterBackend
from printer.windows_print import WindowsPrinterBackend

logger = logging.getLogger(__name__)


class JobProcessorState(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


@dataclass
class JobQueue:
    """Thread-safe job queue."""
    _queue: List[PrintJob] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _current_job: Optional[PrintJob] = None
    
    def add(self, job: PrintJob) -> None:
        with self._lock:
            self._queue.append(job)
    
    def get_next(self) -> Optional[PrintJob]:
        with self._lock:
            if self._queue:
                job = self._queue.pop(0)
                self._current_job = job
                return job
            return None
    
    def complete_current(self, success: bool) -> None:
        with self._lock:
            self._current_job = None
    
    def current(self) -> Optional[PrintJob]:
        with self._lock:
            return self._current_job
    
    def pending_count(self) -> int:
        with self._lock:
            return len(self._queue)


class JobProcessor:
    """Main job processing loop."""
    
    def __init__(self, config: Config):
        self.config = config
        self.state = JobProcessorState.STARTING
        self.queue = JobQueue()
        self.printer: Optional[PrinterBackend] = None
        self.session: Optional[requests.Session] = None
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._status_thread: Optional[threading.Thread] = None
        self._download_dir = Path(config.host.host_id + "_downloads")
        self._download_dir.mkdir(exist_ok=True)
    
    def start(self) -> bool:
        """Initialize and start the job processor."""
        logger.info("Starting job processor...")
        self.state = JobProcessorState.STARTING
        
        # Initialize printer
        if not self._init_printer():
            self.state = JobProcessorState.ERROR
            return False
        
        # Initialize HTTP session
        self._init_http_session()
        
        # Start worker threads
        self._stop_event.clear()
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._status_thread = threading.Thread(target=self._status_report_loop, daemon=True)
        
        self._worker_thread.start()
        self._status_thread.start()
        
        self.state = JobProcessorState.RUNNING
        logger.info("Job processor started")
        return True
    
    def stop(self) -> None:
        """Stop the job processor gracefully."""
        logger.info("Stopping job processor...")
        self.state = JobProcessorState.STOPPING
        self._stop_event.set()
        
        if self._worker_thread:
            self._worker_thread.join(timeout=30)
        if self._status_thread:
            self._status_thread.join(timeout=10)
        
        if self.printer:
            self.printer.disconnect()
        
        if self.session:
            self.session.close()
        
        self.state = JobProcessorState.STOPPED
        logger.info("Job processor stopped")
    
    def _init_printer(self) -> bool:
        """Initialize printer backend based on config."""
        conn = self.config.printer.connection
        
        # Try IPP first
        if conn.startswith(("ipp://", "ipps://", "http://", "https://", "cups://")):
            logger.info("Attempting IPP printer connection...")
            self.printer = IPPPrinterBackend(self.config.printer.connection)
            if self.printer.connect():
                logger.info("IPP printer connected successfully")
                return True
            logger.warning("IPP connection failed")
        
        # Try Windows fallback
        if self.config.printer.windows_fallback:
            logger.info("Attempting Windows printer connection...")
            self.printer = WindowsPrinterBackend(self.config.printer.connection)
            if self.printer.connect():
                logger.info("Windows printer connected successfully")
                return True
            logger.warning("Windows printer connection failed")
        
        # Auto-detect
        if conn == "auto":
            logger.info("Auto-detecting printer...")
            # Try Windows first (most common on shop PCs)
            self.printer = WindowsPrinterBackend("")
            if self.printer.connect():
                logger.info("Auto-detected Windows printer")
                return True
            
            # Try local CUPS
            self.printer = IPPPrinterBackend("cups://")
            if self.printer.connect():
                logger.info("Auto-detected CUPS printer")
                return True
        
        logger.error("Failed to connect to any printer")
        return False
    
    def _init_http_session(self) -> None:
        """Initialize HTTP session with retry strategy."""
        self.session = requests.Session()
        
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "POST", "PUT", "DELETE", "OPTIONS", "TRACE"],
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Set default headers
        self.session.headers.update({
            "User-Agent": f"PrintHost/{self.config.host.host_id}",
            "X-Print-Host-Key": self.config.central_api.api_key,
            "Content-Type": "application/json",
        })
        
        # SSL verification
        self.session.verify = self.config.central_api.verify_ssl
    
    def _worker_loop(self) -> None:
        """Main job processing loop."""
        logger.info("Worker loop started")
        
        while not self._stop_event.is_set():
            try:
                # Check if we can accept more jobs
                if self.queue.pending_count() == 0 and self.queue.current() is None:
                    # Poll for new jobs
                    self._poll_for_jobs()
                
                # Process next job if available and printer idle
                current = self.queue.current()
                if current is None:
                    next_job = self.queue.get_next()
                    if next_job:
                        self._process_job(next_job)
                
                # Small sleep to prevent busy waiting
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"Worker loop error: {e}", exc_info=True)
                time.sleep(5)
        
        logger.info("Worker loop stopped")
    
    def _status_report_loop(self) -> None:
        """Periodically report printer status to central API."""
        while not self._stop_event.is_set():
            try:
                self._report_status()
            except Exception as e:
                logger.error(f"Status report error: {e}")
            
            # Wait for next interval
            self._stop_event.wait(self.config.central_api.poll_interval_seconds)
    
    def _poll_for_jobs(self) -> None:
        """Fetch pending jobs from central API."""
        url = f"{self.config.central_api.base_url}/print-host/jobs/pending/"
        params = {"host_id": self.config.host.host_id}
        
        try:
            resp = self.session.get(
                url,
                params=params,
                timeout=self.config.central_api.timeout_seconds,
            )
            
            if resp.status_code == 200:
                jobs_data = resp.json()
                for job_data in jobs_data:
                    self._queue_job(job_data)
            elif resp.status_code == 404:
                # No jobs endpoint yet - central not updated
                pass
            else:
                logger.warning(f"Poll failed: {resp.status_code} {resp.text}")
                
        except requests.exceptions.RequestException as e:
            logger.debug(f"Poll request failed: {e}")
    
    def _queue_job(self, job_data: Dict) -> None:
        """Create PrintJob from API data and add to queue."""
        job_id = job_data.get("id") or job_data.get("job_id")
        if not job_id:
            logger.warning(f"Job data missing ID: {job_data}")
            return
        
        # Check if already queued/processing
        for job in self.queue._queue:
            if job.job_id == job_id:
                return
        if self.queue.current() and self.queue.current().job_id == job_id:
            return
        
        # Create print job
        job = PrintJob(
            job_id=job_id,
            file_url=job_data.get("file_url", ""),
            settings=job_data.get("settings", {}),
        )
        
        self.queue.add(job)
        logger.info(f"Queued job {job_id}")
    
    def _process_job(self, job: PrintJob) -> None:
        """Process a single print job."""
        logger.info(f"Processing job {job.job_id}")
        job.status = PrintJobStatus.DOWNLOADING
        self._report_job_status(job, "downloading")
        
        # Download file
        if not self._download_file(job):
            job.status = PrintJobStatus.FAILED
            self._report_job_status(job, "failed")
            self.queue.complete_current(False)
            return
        
        # Print
        self._report_job_status(job, "printing")
        success = self.printer.print_job(job)
        
        if success:
            job.status = PrintJobStatus.PRINTED
            self._report_job_status(job, "printed")
            self.queue.complete_current(True)
        else:
            job.status = PrintJobStatus.FAILED
            self._report_job_status(job, "failed")
            
            # Handle retry
            if job.retry_count < self.config.job_processing.max_retries:
                job.retry_count += 1
                logger.info(f"Retrying job {job.job_id} (attempt {job.retry_count})")
                time.sleep(self.config.job_processing.retry_delay_seconds)
                self.queue.add(job)  # Re-queue for retry
            else:
                logger.error(f"Job {job.job_id} failed after {job.retry_count} retries")
            
            self.queue.complete_current(False)
    
    def _download_file(self, job: PrintJob) -> bool:
        """Download print file from central API."""
        try:
            file_url = job.file_url
            if not file_url:
                job.error_message = "No file URL provided"
                return False
            
            # Generate local filename
            url_hash = hashlib.md5(file_url.encode()).hexdigest()[:8]
            ext = Path(file_url).suffix or ".pdf"
            local_path = self._download_dir / f"{job.job_id}_{url_hash}{ext}"
            
            # Download with streaming
            with self.session.get(file_url, stream=True, timeout=self.config.job_processing.download_timeout_seconds) as r:
                r.raise_for_status()
                with open(local_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            
            job.file_path = local_path
            logger.info(f"Downloaded file for job {job.job_id} to {local_path}")
            return True
            
        except Exception as e:
            job.error_message = f"Download failed: {e}"
            logger.error(f"Download failed for job {job.job_id}: {e}")
            return False
    
    def _report_job_status(self, job: PrintJob, status: str) -> None:
        """Report job status to central API."""
        url = f"{self.config.central_api.base_url}/print-host/jobs/{job.job_id}/status/"
        data = {
            "status": status,
            "pages_printed": job.pages_printed,
            "error_message": job.error_message,
            "printer_name": job.printer_name,
        }
        
        try:
            resp = self.session.post(
                url,
                json=data,
                timeout=self.config.central_api.timeout_seconds,
            )
            if resp.status_code not in (200, 201):
                logger.warning(f"Status report failed: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.error(f"Failed to report job status: {e}")
    
    def _report_status(self) -> None:
        """Report printer status to central API."""
        if not self.printer:
            return
        
        url = f"{self.config.central_api.base_url}/print-host/printer/status/"
        try:
            status = self.printer.get_status()
            caps = self.printer.get_capabilities()
            
            data = {
                "host_id": self.config.host.host_id,
                "is_online": status.is_online,
                "message": status.message,
                "toner_level": status.toner_level,
                "paper_levels": status.paper_levels,
                "jobs_queued": status.jobs_queued,
                "capabilities": {
                    "paper_sizes": caps.paper_sizes,
                    "color_modes": caps.color_modes,
                    "duplex_supported": caps.duplex_supported,
                    "max_copies": caps.max_copies,
                    "orientations": caps.orientations,
                    "media_types": caps.media_types,
                    "finishing_options": caps.finishing_options,
                },
            }
            
            resp = self.session.post(
                url,
                json=data,
                timeout=self.config.central_api.timeout_seconds,
            )
            
            if resp.status_code not in (200, 201):
                logger.debug(f"Printer status report: {resp.status_code}")
                
        except Exception as e:
            logger.debug(f"Status report error: {e}")