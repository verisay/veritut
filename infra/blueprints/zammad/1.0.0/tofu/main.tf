# managed-vps — Hetzner Cloud: sunucu + (ops.) volume + firewall + Cloudflare A kaydı.
# Kimlik: HCLOUD_TOKEN ve CLOUDFLARE_API_TOKEN env (runner mühürden açar). State: pg backend (D11).
terraform {
  required_version = ">= 1.8"
  backend "pg" {}
  required_providers {
    hcloud     = { source = "hetznercloud/hcloud", version = "~> 1.49" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 4.40" }
  }
}

provider "hcloud" {}
provider "cloudflare" {}

variable "workload_id" { type = string }
variable "workload_slug" { type = string }
variable "tenant_slug" { type = string }
variable "hostname" { type = string }
variable "domain" { type = string }
variable "admin_email" { type = string }
variable "ssh_public_key" { type = string }
# Runner'ın Ansible için kullandığı anahtar — runner TF_VAR_runner_ssh_public_key ile geçer (dosya değil).
variable "runner_ssh_public_key" { type = string }
variable "region" { type = string }
variable "size" { type = string }
variable "residency" { type = string }
variable "server_type" { type = string }
variable "volume_gb" { type = number }
variable "cloudflare_zone_id" {
  type    = string
  default = ""
}

locals {
  name        = "${var.tenant_slug}-${var.workload_slug}"
  labels      = { veritut_workload = var.workload_id, veritut_tenant = var.tenant_slug, veritut_residency = var.residency, managed_by = "veritut" }
  extra_ports = [] # uygulama blueprint'i: yalnız 22/80/443; ek port açılmaz
}

resource "hcloud_ssh_key" "customer" {
  name       = "${local.name}-customer"
  public_key = var.ssh_public_key
  labels     = local.labels
}

resource "hcloud_ssh_key" "runner" {
  name       = "${local.name}-runner"
  public_key = var.runner_ssh_public_key
  labels     = local.labels
}

resource "hcloud_firewall" "fw" {
  name   = local.name
  labels = local.labels
  dynamic "rule" {
    for_each = toset(["22", "80", "443"])
    content {
      direction  = "in"
      protocol   = "tcp"
      port       = rule.value
      source_ips = ["0.0.0.0/0", "::/0"]
    }
  }
  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "vm" {
  name         = local.name
  server_type  = var.server_type
  image        = "ubuntu-24.04"
  location     = var.region
  ssh_keys     = [hcloud_ssh_key.customer.id, hcloud_ssh_key.runner.id]
  firewall_ids = [hcloud_firewall.fw.id]
  labels       = local.labels
  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }
  lifecycle { ignore_changes = [ssh_keys] }
}

resource "hcloud_volume" "data" {
  count     = var.volume_gb > 0 ? 1 : 0
  name      = "${local.name}-data"
  size      = var.volume_gb
  server_id = hcloud_server.vm.id
  automount = true
  format    = "ext4"
  labels    = local.labels
}

resource "cloudflare_record" "a" {
  count   = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.hostname
  type    = "A"
  content = hcloud_server.vm.ipv4_address
  proxied = false
  ttl     = 300
}

output "host" { value = hcloud_server.vm.ipv4_address }
output "ipv4" { value = hcloud_server.vm.ipv4_address }
output "ipv6" { value = hcloud_server.vm.ipv6_address }
output "server_id" { value = hcloud_server.vm.id }
output "fqdn" { value = "${var.hostname}.${var.domain}" }
output "volume_device" { value = var.volume_gb > 0 ? hcloud_volume.data[0].linux_device : "" }
output "probe_url" { value = "https://${var.hostname}.${var.domain}/" }
output "url" { value = "https://${var.hostname}.${var.domain}" }
output "endpoints" {
  value = [{ label = "Zammad", url = "https://${var.hostname}.${var.domain}" }, { label = "SSH", url = "ssh://root@${var.hostname}.${var.domain}" }]
}
output "access" {
  value     = { ssh_user = "root", ssh_host = hcloud_server.vm.ipv4_address, note = "Anahtar ile giriş; parola kapalı." }
  sensitive = true
}
