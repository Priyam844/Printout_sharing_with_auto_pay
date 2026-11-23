from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum
from pathlib import Path


class PrintJobStatus(str, Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    PRINTING = "printing"
    PRINTED = "printed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class PrintJob:
    job_id: str
    file_url: str
    file_path: Optional[Path] = None
    settings: Dict[str, Any] = field(default_factory=dict)
    status: PrintJobStatus = PrintJobStatus.PENDING
    error_message: Optional[str] = None
    pages_printed: int = 0
    printer_name: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    retry_count: int = 0


@dataclass
class PrinterCapabilities:
    paper_sizes: List[str] = field(default_factory=list)
    color_modes: List[str] = field(default_factory=list)
    duplex_supported: bool = False
    max_copies: int = 999
    orientations: List[str] = field(default_factory=list)
    media_types: List[str] = field(default_factory=list)
    finishing_options: List[str] = field(default_factory=list)


@dataclass
class PrinterStatus:
    is_online: bool = False
    message: str = ""
    toner_level: Optional[int] = None
    paper_levels: Dict[str, int] = field(default_factory=dict)
    jobs_queued: int = 0


class PrinterBackend(ABC):
    """Abstract base class for printer backends."""
    
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self._capabilities: Optional[PrinterCapabilities] = None
    
    @abstractmethod
    def connect(self) -> bool:
        """Establish connection to printer."""
        pass
    
    @abstractmethod
    def disconnect(self) -> None:
        """Close connection to printer."""
        pass
    
    @abstractmethod
    def get_capabilities(self) -> PrinterCapabilities:
        """Get printer capabilities."""
        pass
    
    @abstractmethod
    def get_status(self) -> PrinterStatus:
        """Get current printer status."""
        pass
    
    @abstractmethod
    def print_job(self, job: 'PrintJob') -> bool:
        """Execute print job. Returns True on success."""
        pass
    
    @abstractmethod
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending/printing job."""
        pass
    
    def _apply_settings(self, job: 'PrintJob') -> Dict[str, Any]:
        """Convert job settings to printer-specific options."""
        options = {}
        
        # Paper size
        if "paper_size" in job.settings:
            options["media"] = job.settings["paper_size"]
        
        # Color mode
        if "color_mode" in job.settings:
            if job.settings["color_mode"] == "bw":
                options["print-color-mode"] = "monochrome"
            else:
                options["print-color-mode"] = "color"
        
        # Duplex
        if "duplex" in job.settings and job.settings["duplex"]:
            options["sides"] = "two-sided-long-edge"
        else:
            options["sides"] = "one-sided"
        
        # Copies
        if "copies" in job.settings:
            options["copies"] = str(job.settings["copies"])
        
        # Orientation
        if "orientation" in job.settings:
            if job.settings["orientation"] == "landscape":
                options["orientation-requested"] = "4"
            else:
                options["orientation-requested"] = "3"
        
        # Page range
        if "page_range" in job.settings and job.settings["page_range"]:
            options["page-ranges"] = job.settings["page_range"]
        
        return options