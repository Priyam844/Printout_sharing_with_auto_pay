#!/usr/bin/env python3
"""
Print Host Service
Standalone service that runs on the machine connected to the printer.
Polls central API for print jobs, executes them, and reports status.
"""

import sys
import signal
import logging
import argparse
from pathlib import Path

# Add print-host to path
sys.path.insert(0, str(Path(__file__).parent))

from config import get_config, reload_config, Config
from job_processor import JobProcessor
from config import LoggingConfig

# Configure logging
def setup_logging(config: LoggingConfig) -> None:
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, config.level))
    console_handler.setFormatter(logging.Formatter(log_format))
    
    # File handler with rotation
    from logging.handlers import RotatingFileHandler
    file_handler = RotatingFileHandler(
        config.file,
        maxBytes=config.max_bytes,
        backupCount=config.backup_count,
    )
    file_handler.setLevel(getattr(logging, config.level))
    file_handler.setFormatter(logging.Formatter(log_format))
    
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, config.level))
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    
    # Reduce noise from libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)


def main():
    parser = argparse.ArgumentParser(description="Print Host Service")
    parser.add_argument(
        "--config",
        "-c",
        help="Path to config file",
        default=None,
    )
    parser.add_argument(
        "--validate-config",
        action="store_true",
        help="Validate configuration and exit",
    )
    parser.add_argument(
        "--test-print",
        help="Test print a file",
        metavar="FILE",
    )
    args = parser.parse_args()
    
    # Load configuration
    try:
        if args.config:
            config = Config.load(args.config)
        else:
            config = Config.load()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("Copy config.yaml to config.local.yaml and modify as needed")
        sys.exit(1)
    except Exception as e:
        print(f"Config error: {e}")
        sys.exit(1)
    
    # Setup logging
    setup_logging(config.logging)
    logger = logging.getLogger(__name__)
    
    logger.info(f"Starting Print Host: {config.host.name} ({config.host.host_id})")
    logger.info(f"Central API: {config.central_api.base_url}")
    logger.info(f"Printer connection: {config.printer.connection}")
    
    if args.validate_config:
        logger.info("Configuration valid")
        return 0
    
    # Initialize job processor
    processor = JobProcessor(config)
    
    # Handle shutdown signals
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        processor.stop()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start processor
    if not processor.start():
        logger.error("Failed to start job processor")
        return 1
    
    logger.info("Print Host running. Press Ctrl+C to stop.")
    
    try:
        # Keep main thread alive
        import threading
        while threading.main_thread().is_alive():
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        processor.stop()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())