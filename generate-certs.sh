#!/bin/bash
# Generate self-signed TLS certificates for the remote server

TLS_DIR="./tls"
KEY_FILE="$TLS_DIR/server.key"
CRT_FILE="$TLS_DIR/server.crt"

# Default subject values
SUBJ_C="${TLS_CERT_C:-TW}"
SUBJ_ST="${TLS_CERT_ST:-Taiwan}"
SUBJ_L="${TLS_CERT_L:-Taipei}"
SUBJ_O="${TLS_CERT_O:-Ingics}"
SUBJ_CN="${TLS_CERT_CN:-localhost}"

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--country) SUBJ_C="$2"; shift 2 ;;
    --country=*) SUBJ_C="${1#*=}"; shift ;;
    -st|--state) SUBJ_ST="$2"; shift 2 ;;
    --state=*) SUBJ_ST="${1#*=}"; shift ;;
    -l|--locality) SUBJ_L="$2"; shift 2 ;;
    --locality=*) SUBJ_L="${1#*=}"; shift ;;
    -o|--org) SUBJ_O="$2"; shift 2 ;;
    --org=*) SUBJ_O="${1#*=}"; shift ;;
    -cn|--common-name) SUBJ_CN="$2"; shift 2 ;;
    --common-name=*) SUBJ_CN="${1#*=}"; shift ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -c, --country CODE      Country code (default: TW)"
      echo "  -st, --state NAME       State/Province (default: Taiwan)"
      echo "  -l, --locality NAME     Locality/City (default: Taipei)"
      echo "  -o, --org NAME          Organization (default: Ingics)"
      echo "  -cn, --common-name NAME Common Name/CN (default: localhost)"
      echo ""
      echo "Environment variables:"
      echo "  TLS_CERT_C, TLS_CERT_ST, TLS_CERT_L, TLS_CERT_O, TLS_CERT_CN"
      exit 0 ;;
    *) shift ;;
  esac
done

SUBJ="/C=$SUBJ_C/ST=$SUBJ_ST/L=$SUBJ_L/O=$SUBJ_O/CN=$SUBJ_CN"

# Create tls directory if it doesn't exist
mkdir -p "$TLS_DIR"

# Generate private key and self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$KEY_FILE" \
  -out "$CRT_FILE" \
  -subj "$SUBJ"

echo ""
echo "=== Generated certificates ==="
echo ""
echo "Key:  $KEY_FILE"
echo "Cert: $CRT_FILE"
echo ""
echo "=== Certificate Details ==="
openssl x509 -in "$CRT_FILE" -noout -dates -subject
echo ""
echo "=== Key Details ==="
openssl rsa -in "$KEY_FILE" -noout -text 2>/dev/null | head -5
