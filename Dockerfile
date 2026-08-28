# The DXB platform is a static site — plain HTML, CSS and JS with no build step —
# so nginx serves the files directly. Two entry URLs are exposed:
#   /       the passenger site
#   /admin  the Operations Control Center
# Both are the same single-page shell; nginx maps the paths and the app decides
# which surface to open from the pathname.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dubai-airport-platform/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
