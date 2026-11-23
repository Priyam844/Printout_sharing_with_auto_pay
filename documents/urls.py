from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DocumentViewSet,
    DocumentShareView,
    PrintJobViewSet,
    PrintHostViewSet,
    PrintHostAPIViewSet,
    LoginView,
    LogoutView,
    CurrentUserView,
    StoreSettingsView,
    AdminDashboardStatsView,
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'print-jobs', PrintJobViewSet, basename='printjob')
router.register(r'print-hosts', PrintHostViewSet, basename='printhost')

# Print Host API (separate router for host-specific endpoints)
host_router = DefaultRouter()
host_router.register(r'', PrintHostAPIViewSet, basename='printhost-api')

urlpatterns = [
    # Auth & Store Admin
    path('api/auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('api/auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('api/store-settings/', StoreSettingsView.as_view(), name='store-settings'),
    path('api/admin/dashboard-stats/', AdminDashboardStatsView.as_view(), name='admin-dashboard-stats'),

    # Sharing & Batches
    path('api/share/<uuid:token>/', DocumentShareView.as_view(), name='document-share-api'),
    path('api/share/batch/<uuid:batch_id>/', DocumentViewSet.as_view({'get': 'batch_details'}), name='batch-share-api'),
    path('api/', include(router.urls)),
    path('api/print-host/', include(host_router.urls)),
]