import os
import yaml
from pathlib import Path
from typing import Any, Dict, Optional
from dataclasses import dataclass, field


@dataclass
class PrinterConfig:
    connection: str = "auto"
    windows_fallback: bool = True


@dataclass
class CentralAPIConfig:
    base_url: str = "http://localhost:8000/api"
    api_key: str = "CHANGE_ME_IN_PRODUCTION"
    poll_interval_seconds: int = 10
    timeout_seconds: int = 30
    verify_ssl: bool = False


@dataclass
class HostConfig:
    host_id: str = "print-host-001"
    name: str = "Shop Floor Printer"
    location: str = "Main Shop Floor"


@dataclass
class LoggingConfig:
    level: str = "INFO"
    file: str = "print-host.log"
    max_bytes: int = 10485760
    backup_count: int = 5


@dataclass
class JobProcessingConfig:
    max_concurrent: int = 1
    retry_delay_seconds: int = 60
    max_retries: int = 3
    download_timeout_seconds: int = 60


@dataclass
class Config:
    printer: PrinterConfig = field(default_factory=PrinterConfig)
    central_api: CentralAPIConfig = field(default_factory=CentralAPIConfig)
    host: HostConfig = field(default_factory=HostConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    job_processing: JobProcessingConfig = field(default_factory=JobProcessingConfig)

    @classmethod
    def load(cls, config_path: Optional[str] = None) -> "Config":
        if config_path is None:
            config_path = os.environ.get(
                "PRINT_HOST_CONFIG",
                str(Path(__file__).parent / "config.yaml")
            )
        
        config_file = Path(config_path)
        if not config_file.exists():
            # Try local override
            local_file = config_file.with_name("config.local.yaml")
            if local_file.exists():
                config_file = local_file
            else:
                raise FileNotFoundError(f"Config file not found: {config_path}")
        
        with open(config_file, "r") as f:
            data = yaml.safe_load(f)
        
        return cls(
            printer=PrinterConfig(**data.get("printer", {})),
            central_api=CentralAPIConfig(**data.get("central_api", {})),
            host=HostConfig(**data.get("host", {})),
            logging=LoggingConfig(**data.get("logging", {})),
            job_processing=JobProcessingConfig(**data.get("job_processing", {})),
        )


_config: Optional[Config] = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config.load()
    return _config


def reload_config(config_path: Optional[str] = None) -> Config:
    global _config
    _config = Config.load(config_path)
    return _config