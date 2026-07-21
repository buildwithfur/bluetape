from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeSourceUrl(ValueError):
    pass


def validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise UnsafeSourceUrl("Source must be a public HTTP or HTTPS URL")
    if parsed.username or parsed.password:
        raise UnsafeSourceUrl("Source URL credentials are not allowed")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeSourceUrl("Source hostname could not be resolved") from exc
    if not addresses:
        raise UnsafeSourceUrl("Source hostname did not resolve")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise UnsafeSourceUrl("Source resolves to a non-public network")
