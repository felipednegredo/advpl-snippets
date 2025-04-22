#!/bin/bash

# Caminho para o arquivo de versão
VERSION_FILE="version.txt"

# Leia a versão atual do arquivo
CURRENT_VERSION=$(cat $VERSION_FILE)

# Divida a versão em partes (assumindo formato MAJOR.MINOR.PATCH)
IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"

# Solicitar ao usuário o formato do incremento
echo "Escolha o formato do incremento:"
echo "1) MAJOR"
echo "2) MINOR"
echo "3) PATCH"
read -p "Digite o número correspondente (1/2/3): " CHOICE

# Incrementar a parte escolhida
case $CHOICE in
    1)
        VERSION_PARTS[0]=$((VERSION_PARTS[0] + 1))
        VERSION_PARTS[1]=0
        VERSION_PARTS[2]=0
        ;;
    2)
        VERSION_PARTS[1]=$((VERSION_PARTS[1] + 1))
        VERSION_PARTS[2]=0
        ;;
    3)
        VERSION_PARTS[2]=$((VERSION_PARTS[2] + 1))
        ;;
    *)
        echo "Opção inválida. Saindo."
        exit 1
        ;;
esac

# Atualizar a versão
NEW_VERSION="${VERSION_PARTS[0]}.${VERSION_PARTS[1]}.${VERSION_PARTS[2]}"

# Escrever a nova versão no arquivo
echo $NEW_VERSION > $VERSION_FILE

# Exibir a nova versão
echo "Versão atualizada para: $NEW_VERSION"

# Substituir apenas quando o texto for no formato "version": "0.0.11"
find . -type f \( -name "package.json" -o -name "package-lock.json" \) -exec sed -i -E "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/g" {} +
