const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');


// === Utils ===

function loadJSONFile(filePath, defaultValue = {}) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Erro ao carregar ${filePath}:`, error.message);
        return defaultValue;
    }
}

function buildMarkdownFromFunction(word, funcInfo) {
    const md = new vscode.MarkdownString();
    const title = word.replace(/\b\w/g, char => char.toUpperCase());

    md.appendMarkdown(`## ${title}\n`);
    md.appendMarkdown(`${funcInfo.description}\n\n`);

    if (funcInfo.parameters && Object.keys(funcInfo.parameters).length > 0) {
        md.appendMarkdown('#### Parâmetros\n');
        for (const [name, info] of Object.entries(funcInfo.parameters)) {
            md.appendMarkdown(`- \`${name}\` (${info.type}): ${info.description}\n`);
        }
        md.appendMarkdown('\n');
    } else {
        md.appendMarkdown('_Sem parâmetros._\n\n');
    }

    if (funcInfo.returns) {
        md.appendMarkdown('#### Retorno\n');
        md.appendMarkdown(`- (${funcInfo.returns.type}): ${funcInfo.returns.description}\n\n`);
    } else {
        md.appendMarkdown('_Sem retorno._\n\n');
    }

    if (funcInfo.example) {
        md.appendMarkdown('#### Exemplo\n');
        md.appendCodeblock(funcInfo.example, 'advpl');
    }

    if (funcInfo.documentation) {
        md.appendMarkdown(`\n[🔗 Documentação completa](${funcInfo.documentation})\n`);
    }

    md.isTrusted = true;
    return md;
}

function extractFunctionBlock(document, position) {
    const text = document.getText();
    const regex = /\b(?:STATIC |USER )?FUNCTION\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\n([\s\S]*?)(?=\n\b(?:STATIC |USER )?FUNCTION|\Z)/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const start = document.positionAt(match.index);
        const end = document.positionAt(match.index + match[0].length);
        if (position.isAfterOrEqual(start) && position.isBeforeOrEqual(end)) {
            return {
                name: match[1],
                params: match[2].split(',').map(p => p.trim()).filter(Boolean),
                body: match[3].trim(),
                range: new vscode.Range(start, end)
            };
        }
    }

    return null;
}

function buildFunctionDocumentationBlock(func) {
    const lines = [
        `/*/ {Protheus.doc}`,
        `Descrição: Descreva aqui o propósito da função.`,
        `@type user`,
        `@since ${new Date().toLocaleDateString()}`,
        `@version 1.0`,
        ...func.params.map(p => `@param ${p}, Tipo desconhecido, Descrição`),
        `@return Tipo, Descrição`,
        `@example`,
        `Exemplo de uso da função.`,
        `@see Referências adicionais.`,
        `/*/`
    ];
    return lines.join('\n');
}

function insertDocumentationBlock(editor, func) {
    const docBlock = buildFunctionDocumentationBlock(func);
    editor.edit(builder => {
        builder.insert(func.range.start, docBlock + '\n');
    });
}


// === Server Utils ===

function getServerConfigFile() {
    return path.join(getServerConfigPath(), "servers.json");
}

function getServerConfigPath() {
    return isWorkspaceServerConfig() ? getVSCodePath() : path.join(os.homedir(), ".totvsls");
}

function isWorkspaceServerConfig() {
    return false;
}

function getVSCodePath() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? path.join(folder.uri.fsPath, ".vscode") : "";
}

function getServers() {
    const servers = loadJSONFile(getServerConfigFile(), { configurations: [], savedTokens: {} });
    return servers.configurations;
}

function lastConnectedServer() {
    const servers = loadJSONFile(getServerConfigFile(), {});
    if (servers?.lastConnectedServer) {
        return getServerById(servers.lastConnectedServer);
    }
    return undefined;
}

function getServerById(id) {
    const servers = loadJSONFile(getServerConfigFile(), {});
    return servers.configurations.find(server => server.id === id);
}

function getSavedTokens(id, environment) {
    const servers = loadJSONFile(getServerConfigFile(), {});
    if (servers.savedTokens) {
        const filtered = servers.savedTokens.filter(element => element[0] === `${id}:${environment}`);
        if (filtered.length) {
            return filtered[0][1].token;
        }
    }
    return null;
}

function updateSavedToken(id, environment, token) {
    const servers = loadJSONFile(getServerConfigFile(), {});
    const key = `${id}:${environment}`;
    const data = { id, environment, token };
    servers.savedTokens[key] = data;
    fs.writeFileSync(getServerConfigFile(), JSON.stringify(servers, null, 2), 'utf8');
}

function saveSelectServer(id, token, environment, username) {
    const servers = loadJSONFile(getServerConfigFile(), {});
    servers.configurations.forEach(element => {
        if (element.id === id) {
            if (!element.environments) {
                element.environments = [environment];
            } else if (!element.environments.includes(environment)) {
                element.environments.push(environment);
            }
            element.username = username;
            element.environment = environment;
            element.token = token;
            servers.connectedServer = element;
            servers.lastConnectedServer = element.id;
        }
    });
    fs.writeFileSync(getServerConfigFile(), JSON.stringify(servers, null, 2), 'utf8');
}

function saveServerEnvironmentUsername(id, environment, username) {
    const servers = loadJSONFile(getServerConfigFile(), {});
    let updated = false;
    servers.configurations.forEach(element => {
        if (element.id === id) {
            if (!element.environments) {
                element.environments = [environment];
            } else if (!element.environments.includes(environment)) {
                element.environments.push(environment);
            }
            element.environment = environment;
            element.username = username;
            updated = true;
        }
    });
    if (updated) {
        fs.writeFileSync(getServerConfigFile(), JSON.stringify(servers, null, 2), 'utf8');
    } else {
        vscode.window.showWarningMessage("Nenhum servidor encontrado com o ID informado.");
    }
}

function saveConnectionToken(id, token, environment) {
    const servers = loadJSONFile(getServerConfigFile(), {});
    const key = `${id}:${environment}`;
    if (!servers.savedTokens) {
        servers.savedTokens = [];
    }
    let found = false;
    servers.savedTokens.forEach((element, index) => {
        if (element[0] === key) {
            servers.savedTokens[index][1] = { id, token };
            found = true;
        }
    });
    if (!found) {
        servers.savedTokens.push([key, { id, token }]);
    }
    fs.writeFileSync(getServerConfigFile(), JSON.stringify(servers, null, 2), 'utf8');
}


// === Webview: Mostrar Servidores ===

export function registerShowServersCommand(context) {
    const disposable = vscode.commands.registerCommand("advplSnippets.showServers", () => {
        const panel = vscode.window.createWebviewPanel(
            "serverView",
            "Servidores Configurados",
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        try {
            const servers = getServers();
            const jsonData = JSON.stringify(servers, null, 2);

            const htmlPath = path.join(context.extensionPath, "src", "webview.html");
            let htmlContent = fs.readFileSync(htmlPath, "utf8");

            htmlContent = htmlContent.replace("const servers = [];", `const servers = ${jsonData};`);
            panel.webview.html = htmlContent;
        } catch (error) {
            console.error("Erro ao carregar os servidores:", error);
            vscode.window.showErrorMessage("Erro ao carregar os servidores configurados.");
        }
    });

    context.subscriptions.push(disposable);
}

// === Ativação da Extensão ===

/** @param {vscode.ExtensionContext} context */
function activate(context) {
    const docsPath =  path.join(__dirname, 'functionsDescriptions.json');
    const advplDocs = loadJSONFile(docsPath);

    // Hover Provider
    const hoverProvider = vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);
            const funcInfo = advplDocs[word.toLowerCase()];
            if (funcInfo) {
                return new vscode.Hover(buildMarkdownFromFunction(word, funcInfo));
            }
            return null;
        }
    });

    // Comando para adicionar documentação Protheus
    const docCommand = vscode.commands.registerCommand('advplSnippets.addDocumentation', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Nenhum editor ativo.');
            return;
        }

        const func = extractFunctionBlock(editor.document, editor.selection.active);
        if (!func) {
            vscode.window.showWarningMessage('Nenhuma função encontrada na posição atual.');
            return;
        }

        const existingDocRange = new vscode.Range(
            func.range.start.translate(-8), // procura linhas acima da função
            func.range.start
        );
        const existingText = editor.document.getText(existingDocRange);

        if (existingText.includes('/*/ {Protheus.doc}')) {
            vscode.window.showWarningMessage('A função já possui um bloco de documentação.');
            return;
        }

        insertDocumentationBlock(editor, func);
        vscode.window.showInformationMessage('Bloco de documentação adicionado!');
    });

    // Comando para mostrar os servidores configurados
    registerShowServersCommand(context);

    context.subscriptions.push(hoverProvider, docCommand);
}

// === Desativação da Extensão ===

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
