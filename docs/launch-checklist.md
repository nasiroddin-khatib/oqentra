# OQENTRA launch checklist

- [ ] Confirm final domain and configure DNS.
- [ ] Create private AWS RDS PostgreSQL and dedicated least-privilege DB user.
- [ ] Restrict RDS 5432 inbound to the backend EC2 security group only.
- [ ] Install current RDS CA bundle and verify PostgreSQL TLS certificate validation.
- [ ] Configure EC2 instance role for the exact Secrets Manager secret if used.
- [ ] Set strong JWT secret, admin credentials, exact CORS origins and public site URL.
- [ ] Run migrations and verify `/api/ready` reports database connectivity.
- [ ] Configure Nginx HTTPS, static frontend root and `/api/` reverse proxy.
- [ ] Restrict `/metrics` to Prometheus/monitoring private network.
- [ ] Submit test enquiry and verify its database row.
- [ ] Create referral link, open it in a clean browser and verify attribution on enquiry.
- [ ] Verify payment manually before recording referral conversion; test duplicate payment reference protection.
- [ ] Configure RDS backups and perform a restore test.
- [ ] Configure CloudWatch Agent, alarms and SNS notifications.
- [ ] Add email verification and password-reset delivery before enabling customer accounts broadly.
- [ ] Build protected admin dashboard and customer account screens if required.
- [ ] Finalize referral terms, privacy notice, data retention and deletion process.
- [ ] Perform dependency, security and load testing before public launch.
