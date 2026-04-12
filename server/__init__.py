"""
server — FastAPI HTTP adapter for the Adaptive Crisis Management Environment.

This package exposes the ``app`` object (a ``FastAPI`` instance) that serves
as the OpenEnv-compliant HTTP bridge.  All environment mutation is delegated
to ``env.environment.CrisisManagementEnv``; this layer is a stateless router.

Modules
-------
app : FastAPI application with ``/reset``, ``/step``, ``/state``, ``/health``,
      ``/metrics``, ``/trajectory``, and ``/web`` endpoints.
"""
