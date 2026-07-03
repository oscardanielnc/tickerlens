"""Per-IP rate limiting.

The public demo runs 24/7 with the owner's API keys, so every endpoint that
spends provider quota or AI tokens must be limited. Limits are configured in
Settings and applied per route via decorators.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, headers_enabled=True)
