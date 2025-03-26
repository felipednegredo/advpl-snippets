#!/bin/bash

# Caminho para o arquivo de versão
VERSION_FILE="version.txt"

# Leia a versão atual do arquivo
CURRENT_VERSION=$(cat $VERSION_FILE)

# Divida a versão em partes (assumindo formato MAJOR.MINOR.PATCH)
IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"

# Incrementar a parte PATCH da versão
PATCH=${VERSION_PARTS[2]}
PATCH=$((PATCH + 1))

# Atualizar a versão
NEW_VERSION="${VERSION_PARTS[0]}.${VERSION_PARTS[1]}.$PATCH"

# Escrever a nova versão no arquivo
echo $NEW_VERSION > $VERSION_FILE

# Exibir a nova versão
echo "Versão atualizada para: $NEW_VERSION"
