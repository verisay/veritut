# mock-vps — gerçek kaynak yok. `terraform_data` yerleşik (provider indirmesi gerekmez).
# State pg backend'de (D11): conn_str + schema_name runner tarafından -backend-config ile verilir.
terraform {
  required_version = ">= 1.8"
  backend "pg" {}
}

variable "workload_id" { type = string }
variable "workload_slug" { type = string }
variable "tenant_slug" { type = string }
variable "hostname" { type = string }
variable "admin_email" { type = string }
variable "root_password" {
  type      = string
  sensitive = true
}
variable "monitoring" {
  type    = bool
  default = true
}
variable "region" { type = string }
variable "size" { type = string }
variable "residency" { type = string }
variable "server_type" { type = string }
variable "volume_gb" { type = number }

# "Sunucu": boyut değişince yeniden yaratılır (gerçek VM'de server_type değişimi kesinti demektir) → high risk → onay.
resource "terraform_data" "server" {
  input            = { hostname = var.hostname, server_type = var.server_type, region = var.region }
  triggers_replace = [var.server_type]
}

# "Volume": boyut büyümesi yerinde güncelleme (low/medium).
resource "terraform_data" "volume" {
  input = { size_gb = var.volume_gb }
}

# "Firewall": her zaman var.
resource "terraform_data" "firewall" {
  input = { allow = ["22", "9100"] }
}

output "host" { value = "localhost" }
output "ipv4" { value = "127.0.0.1" }
output "server_id" { value = terraform_data.server.id }
output "probe_url" { value = "http://veritut-api:4400/api/v1/health" }
output "url" { value = "http://${var.hostname}.${var.tenant_slug}.uygulama.veritut.com" }
output "endpoints" {
  value = [{ label = "SSH", url = "ssh://root@${var.hostname}.${var.tenant_slug}.uygulama.veritut.com" }]
}
output "access" {
  value     = { ssh_user = "root", ssh_password = var.root_password }
  sensitive = true
}
