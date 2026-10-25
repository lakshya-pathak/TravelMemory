# TravelMemory Deployment Guide to AWS

## Target Architecture Overview

- **VPC Setup**: Custom VPC spanning 2 Availability Zones with 2 Public Subnets (for Internet‑facing ALBs and NAT Gateways) and 2 Private Subnets (for EC2 instances and MongoDB Atlas network access).
- **Load Balancers**:
  - **Backend ALB** (Internal or Internet‑Facing): Listens on port 80/443 and forwards traffic to a backend Target Group on port `3001`. If the frontend React app runs in client browsers, this ALB must be Internet‑facing so browsers can query API endpoints.
  - **Frontend ALB** (Internet‑Facing): Listens on port 80/443 and forwards traffic to a frontend Target Group on port `80` (served via Nginx).
- **Auto Scaling Groups**: One ASG for the backend (managed by a Launch Template) and one ASG for the frontend.
- **Security Groups**:
  - `fe-alb-sg`: Inbound HTTP (80) / HTTPS (443) from `0.0.0.0/0`.
  - `fe-ec2-sg`: Inbound HTTP (80) restricted to `fe-alb-sg`.
  - `be-alb-sg`: Inbound HTTP (80) / HTTPS (443) from `0.0.0.0/0`.
  - `be-ec2-sg`: Inbound port `3001` restricted to `be-alb-sg`.

---

## Step 1: Configure MongoDB Atlas & Environment Parameters

1. **Create a MongoDB Atlas cluster** and obtain the connection string (`MONGO_URI`).
2. **Whitelist** the outbound NAT Gateway public IPs of your VPC (or allow global access `0.0.0.0/0` during initial setup with strong credentials).
3. Record the expected backend port: `PORT=3001`.

---

## Step 2: Deploy Backend Infrastructure

### Target Group & ALB

- Create an **Application Load Balancer** named `travel-memory-be-alb` across public subnets with security group `be-alb-sg`.
- Create a **Target Group** `tg-backend`:
  - Target type: `instance`
  - Protocol: `HTTP`
  - Port: `3001`
  - Health check path: `/`
- Add a listener on port `80` forwarding to `tg-backend`.
- Note the DNS name of this ALB, e.g., `http://travel-memory-be-alb-1234.us-east-1.elb.amazonaws.com`.

### Backend Launch Template (User Data Script)

```bash
#!/bin/bash
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
export DEBIAN_FRONTEND=noninteractive

# Install dependencies and Node.js 18
apt-get update -y
apt-get install -y git curl
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
npm install -g pm2

# Clone repository
cd /home/ubuntu
git clone https://github.com/lakshya-pathak/TravelMemory.git
cd TravelMemory/backend

# Configure environment variables
cat <<EOT > .env
MONGO_URI='<YOUR_MONGODB_URI>'
PORT=3001
EOT

chown -R ubuntu:ubuntu /home/ubuntu/TravelMemory
npm install

# Start process with PM2 under ubuntu user
su - ubuntu -c "cd /home/ubuntu/TravelMemory/backend && pm2 start index.js --name backend && pm2 save"
su - ubuntu -c "pm2 startup systemd -u ubuntu --hp /home/ubuntu"
```

### Backend Auto Scaling Group

- Create an ASG `asg-backend` attached to the launch template.
- Place instances in the private (or public) application subnets.
- Attach the ASG to the existing Target Group `tg-backend`.
- Configure scaling policies (e.g., Target Tracking on Average CPU Utilization at 70%).

---

## Step 3: Deploy Frontend Infrastructure

> **Note**: React injects `REACT_APP_*` environment variables at build time, so the Backend ALB DNS name must be baked into the build.

### Target Group & ALB

- Create an ALB named `travel-memory-fe-alb` across public subnets with security group `fe-alb-sg`.
- Create a Target Group `tg-frontend`:
  - Target type: `instance`
  - Protocol: `HTTP`
  - Port: `80`
  - Health check path: `/`
- Add a listener on port `80` forwarding to `tg-frontend`.

### Frontend Launch Template (User Data Script)

```bash
#!/bin/bash
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
export DEBIAN_FRONTEND=noninteractive

# Install dependencies, Node.js 18, and Nginx
apt-get update -y
apt-get install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Clone repository
cd /home/ubuntu
git clone https://github.com/lakshya-pathak/TravelMemory.git
cd TravelMemory/frontend

# Configure environment pointing to Backend ALB
cat <<EOT > .env
REACT_APP_BACKEND_URL=http://<BACKEND_ALB_DNS_NAME>
EOT

npm install
npm run build

# Deploy build to Nginx
rm -rf /var/www/html/*
cp -r build/* /var/www/html/

# Configure Nginx for React Single Page Application routing
cat << 'EOF' > /etc/nginx/sites-available/default
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/html;
    index index.html index.htm;

    server_name _;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

systemctl restart nginx
systemctl enable nginx
```

### Frontend Auto Scaling Group

- Create an ASG `asg-frontend` using the frontend launch template.
- Attach it to Target Group `tg-frontend`.
- Configure desired capacity (e.g., Min: 2, Desired: 2, Max: 4) and a Target Tracking scaling policy.

---

## Step 4: Verification & Routing

1. Verify in the EC2 Console that instances in both `tg-backend` and `tg-frontend` transition to **Healthy**.
2. Visit the DNS address of `travel-memory-fe-alb` in your browser.
3. Open browser developer tools (F12) and confirm outbound API calls are hitting `http://<BACKEND_ALB_DNS_NAME>/...` with HTTP `200` responses.

---

