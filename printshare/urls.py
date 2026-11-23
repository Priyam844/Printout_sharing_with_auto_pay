"""
URL configuration for printshare project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('documents.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# Directly serve assets from staticfiles if requested without /static/ prefix
urlpatterns += [
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT / 'assets'}),
]

# Serve React frontend for all other routes
urlpatterns += [
    re_path(r'^(?!api/|admin/|media/|static/|assets/).*$', TemplateView.as_view(template_name='index.html')),
]