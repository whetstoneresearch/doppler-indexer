# Run this from inside metrics directory
# Make sure postgres connection envs are set
# Make sure POSTGRES_SCHEMA is set to current deployment
(crontab -l 2>/dev/null; echo "*/15 * * * * node 3_refresh_mat_view.js") | crontab -
