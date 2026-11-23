#!/usr/bin/env python3
"""
Windows Service Installer for Print Host
Run as Administrator: python install_windows_service.py install
"""

import sys
import os
import argparse
from pathlib import Path

try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
    import win32api
    import win32con
except ImportError:
    print("pywin32 required: pip install pywin32")
    sys.exit(1)


class PrintHostService(win32serviceutil.ServiceFramework):
    _svc_name_ = "PrintHost"
    _svc_display_name_ = "PrintShare Print Host"
    _svc_description_ = "PrintShare Print Host - polls central API for print jobs and executes them"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.processor = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        if self.processor:
            self.processor.stop()

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        self.main()

    def main(self):
        # Add print-host to path
        import sys
        base_dir = Path(__file__).parent
        sys.path.insert(0, str(base_dir))

        from config import get_config, Config, LoggingConfig
        from job_processor import JobProcessor
        import logging
        from logging.handlers import RotatingFileHandler

        # Load config
        config_path = base_dir / "config.local.yaml"
        if not config_path.exists():
            config_path = base_dir / "config.yaml"
        
        config = Config.load(str(config_path))

        # Setup logging to file
        log_file = base_dir / "print-host-service.log"
        logging.basicConfig(
            level=getattr(logging, config.logging.level),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=[
                RotatingFileHandler(
                    log_file,
                    maxBytes=config.logging.max_bytes,
                    backupCount=config.logging.backup_count,
                ),
            ],
        )

        logger = logging.getLogger(__name__)
        logger.info(f"Starting Print Host Service: {config.host.name}")

        from job_processor import JobProcessor
        self.processor = JobProcessor(config)

        if not self.processor.start():
            logger.error("Failed to start job processor")
            return

        # Wait for stop signal
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
        logger.info("Service stopped")


def install_service():
    """Install the Windows service."""
    try:
        win32serviceutil.InstallService(
            sys.executable,
            "PrintHost",
            "PrintShare Print Host",
            startType=win32service.SERVICE_AUTO_START,
            arguments=[str(Path(__file__).parent / "install_windows_service.py")],
        )
        print("Service installed successfully")
        print("Start with: net start PrintHost")
    except Exception as e:
        print(f"Install failed: {e}")
        sys.exit(1)


def remove_service():
    """Remove the Windows service."""
    try:
        win32serviceutil.RemoveService("PrintHost")
        print("Service removed successfully")
    except Exception as e:
        print(f"Remove failed: {e}")
        sys.exit(1)


def start_service():
    try:
        win32serviceutil.StartService("PrintHost")
        print("Service started")
    except Exception as e:
        print(f"Start failed: {e}")


def stop_service():
    try:
        win32serviceutil.StopService("PrintHost")
        print("Service stopped")
    except Exception as e:
        print(f"Stop failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Print Host Windows Service Manager")
    parser.add_argument("action", choices=["install", "remove", "start", "stop", "debug"])
    args = parser.parse_args()

    if args.action == "install":
        install_service()
    elif args.action == "remove":
        remove_service()
    elif args.action == "start":
        start_service()
    elif args.action == "stop":
        stop_service()
    elif args.action == "debug":
        # Run in foreground for debugging
        from print_host_service import PrintHostService
        import sys
        PrintHostService([sys.argv[0]]).main()


if __name__ == "__main__":
    main()