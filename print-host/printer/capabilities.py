import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


def detect_printer_capabilities(connection_string: str) -> Dict[str, Any]:
    """Auto-detect printer capabilities based on connection string."""
    caps = {
        "paper_sizes": ["A4", "A3", "A5", "Letter", "Legal", "Tabloid"],
        "color_modes": ["color", "bw"],
        "duplex_supported": True,
        "max_copies": 999,
        "orientations": ["portrait", "landscape"],
        "media_types": ["plain", "heavy"],
        "finishing_options": ["none"],
    }
    
    conn_lower = connection_string.lower()
    
    # Xerox-specific capabilities
    if "xerox" in conn_lower or "workcentre" in conn_lower:
        caps.update({
            "paper_sizes": ["A4", "A3", "A5", "B4", "B5", "Letter", "Legal", "Tabloid", "Statement", "Executive"],
            "finishing_options": ["none", "staple", "punch", "fold"],
            "media_types": ["plain", "heavy", "light", "glossy", "transparency", "labels", "envelope"],
        })
    
    # HP-specific
    elif "hp" in conn_lower or "hewelett" in conn_lower:
        caps.update({
            "finishing_options": ["none", "staple"],
        })
    
    # Canon-specific
    elif "canon" in conn_lower:
        caps.update({
            "finishing_options": ["none", "staple"],
        })
    
    # Brother-specific
    elif "brother" in conn_lower:
        caps.update({
            "finishing_options": ["none"],
        })
    
    return caps


def get_default_capabilities() -> Dict[str, Any]:
    """Return safe default capabilities."""
    return {
        "paper_sizes": ["A4", "A3", "A5", "Letter", "Legal", "Tabloid"],
        "color_modes": ["color", "bw"],
        "duplex_supported": True,
        "max_copies": 999,
        "orientations": ["portrait", "landscape"],
        "media_types": ["plain"],
        "finishing_options": ["none"],
    }