# syntax=docker/dockerfile:1
# PI Studio: the pi-web fork built from source, with the Pi CLI at the same
# version as the SDK the fork embeds (STUDIO.md §7.1). Build from the repository
# root:  docker build -f docker/Dockerfile -t pi-studio .
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git ripgrep python3 python3-venv build-essential \
  && rm -rf /var/lib/apt/lists/*

# Pinned for the whole mission: package.json pins the SDK to the same version.
ARG PI_VERSION=1.2.0
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent@${PI_VERSION} \
  && pi --version

WORKDIR /opt/pi-studio
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first, so a code change does not reinstall them.
# The postinstall script (bin/prepare-terminal.js) needs bin/.
COPY package.json package-lock.json ./
COPY bin ./bin
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
# A Windows checkout may have turned the script's line endings into CRLF.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

# No password or secret in the image: they come from the environment (.env).
ENV PI_WEB_APP_NAME="PI Studio" \
    PI_CODING_AGENT_DIR=/root/.pi/agent \
    STUDIO_PACKS_DIR=/workspace/packs \
    STUDIO_TEMPLATES_DIR=/opt/pi-studio/studio-templates \
    PORT=30141

WORKDIR /workspace/packs
EXPOSE 30141
ENTRYPOINT ["entrypoint.sh"]
