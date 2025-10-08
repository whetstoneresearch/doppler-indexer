# Run this from inside metrics directory
(crontab -l 2>/dev/null; echo "*/15 * * * * node 3_refresh_mat_view.js") | crontab -
