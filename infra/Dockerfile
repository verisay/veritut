# VERITUT dev imajı — filo deseni (klasman/kaydadeger ile aynı kalıp), Node 22.
# Kaynak compose'da bind-mount edilir (HMR); bu imaj yalnız çalışma zamanını taşır.
FROM node:22-bookworm-slim
ENV COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate
ENV PNPM_HOME=/pnpm CI=1
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm config set store-dir /pnpm/store --global
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates curl \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
# NOT: PDF üretimi (kanıt paketi, SLA raporu, DPA) Türkçe karakter için gömülü TTF ister —
# pdfkit'in yerleşik Helvetica'sı WinAnsi'dir ve ğ/ş/ı taşımaz. DejaVuSans bu yüzden imajda.
WORKDIR /app
