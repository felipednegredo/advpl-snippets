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
    let token;
    if (servers.savedTokens) {
        const filtered = servers.savedTokens.filter(element => element[0] === `${id}:${environment}`);
        if (filtered.length) {
            token = filtered[0][1].token;
        }
    }
    return token;
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
  
        // Injeta os dados direto no HTML
        htmlContent = htmlContent.replace(
          "const servers = [];",
          `const servers = ${jsonData};`
        );
  
        panel.webview.html = htmlContent;
      } catch (error) {
        console.error("Erro ao carregar os servidores:", error);
        vscode.window.showErrorMessage("Erro ao carregar os servidores configurados.");
      }
    });
  
    context.subscriptions.push(disposable);
  }

// === Main Extension Activation ===

function activate(context) {
    let cache = null;
    const descriptions = loadJSONFile(path.join(__dirname, 'functionsDescriptions.json'));
    const classesData = loadJSONFile(path.join(__dirname, 'classesMethods.json'));

    // === Hover Provider ===

    const hoverProvider = vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                if (!range) return null;

                const word = document.getText(range).trim().toLowerCase();
                if (!word) return null;

                const funcInfo = descriptions[word];
                if (funcInfo) return new vscode.Hover(buildMarkdownFromFunction(word, funcInfo));

                // Busca por definição local da função
                const text = document.getText();
                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][\w]*)\s*\(/gi;
                let match;
                while ((match = functionRegex.exec(text)) !== null) {
                    if (match[2].toLowerCase() === word) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`### ${match[2]}\n_Função definida no próprio código._`);
                        md.isTrusted = true;
                        return new vscode.Hover(md);
                    }
                }

                return null;
            } catch (error) {
                console.error('Erro no HoverProvider:', error);
                return null;
            }
        }
    });

    context.subscriptions.push(hoverProvider);

    // === Completion Provider ===

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document) {
                if (cache) return [...cache.functions, ...cache.variables, ...cache.defines];
                cache = { functions: [], variables: [], defines: [] };

                const text = document.getText();

                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][\w]*)\s*\((.*?)\)/gi;
                const variableRegex = /\b(?:LOCAL|STATIC|PUBLIC|PRIVATE)\s+([a-zA-Z_][\w]*)\s*(?:[:=])?/gi;
                const defineRegex = /#DEFINE\s+([a-zA-Z_][\w]*)\s+(.+)/gi;

                let match;

                while ((match = functionRegex.exec(text)) !== null) {
                    const [type, name, paramsRaw] = [match[1], match[2], match[3]];
                    const params = paramsRaw.split(',').map(p => p.trim()).filter(Boolean);
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);

                    item.detail = `${type} definida pelo usuário`;
                    item.documentation = new vscode.MarkdownString(`**Tipo:** ${type}\n**Parâmetros:** ${params.join(', ') || 'Nenhum'}`);
                    item.insertText = params.length
                        ? new vscode.SnippetString(`${name}(${params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                        : `${name}()`;

                    cache.functions.push(item);
                }

                while ((match = variableRegex.exec(text)) !== null) {
                    const name = match[1];
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
                    item.detail = `Variável`;
                    item.documentation = new vscode.MarkdownString(`**Nome:** ${name}`);
                    cache.variables.push(item);
                }

                while ((match = defineRegex.exec(text)) !== null) {
                    const [name, value] = [match[1], match[2].trim()];
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
                    item.detail = `Define`;
                    item.documentation = new vscode.MarkdownString(`**Valor:** \`${value}\``);
                    cache.defines.push(item);
                }

                return [...cache.functions, ...cache.variables, ...cache.defines];
            },

            resolveCompletionItem(item) {
                if (item.kind === vscode.CompletionItemKind.Class) {
                    const className = item.label.toString();
                    const methods = classesData[className]?.methods;
                    if (!methods) return null;

                    const [name, info] = Object.entries(methods)[0];
                    const methodItem = new vscode.CompletionItem(name, vscode.CompletionItemKind.Method);
                    methodItem.detail = `Método: ${info.description}`;
                    methodItem.documentation = new vscode.MarkdownString(`**Descrição:** ${info.description}`);
                    methodItem.insertText = info.parameters?.length
                        ? new vscode.SnippetString(`${name}(${info.parameters.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                        : `${name}()`;

                    return methodItem;
                }

                return null;
            }
        },
        '.', ':'
    );

    context.subscriptions.push(completionProvider);

    // === Classe: IntelliSense de Métodos ===

    const classMethodCompletion = vscode.languages.registerCompletionItemProvider('advpl', {
        provideCompletionItems(document, position) {
            const line = document.lineAt(position).text.slice(0, position.character);
            const match = line.match(/([a-z]\w*)[:\.][a-zA-Z_]*/);
            if (!match) return;

            const objName = match[1];
            const fullText = document.getText();
            const classMatch = new RegExp(`${objName}\\s*:=\\s*(?:([\\w]+)\\(|([\\w]+)::New\\()`, 'i').exec(fullText);
            const className = classMatch?.[1] || classMatch?.[2];
            if (!className || !classesData[className]) return;

            return Object.entries(classesData[className].methods || {}).map(([name, info]) => {
                const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Method);
                item.detail = `Classe ${className}`;
                item.documentation = new vscode.MarkdownString(`**${info.description || ''}**`);
                item.insertText = info.parameters?.length
                    ? new vscode.SnippetString(`${name}(${info.parameters.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                    : new vscode.SnippetString(`${name}()`);

                return item;
            });
        }
    }, ':', '.');

    context.subscriptions.push(classMethodCompletion);

    // === Comando: Gerar Documentação ===

    const generateDocCmd = vscode.commands.registerCommand('advplSnippets.generateDocumentation', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return vscode.window.showErrorMessage('Nenhum editor ativo.');

        const text = editor.document.getText();
        const position = editor.selection.active;

        const regex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][\w]*)\s*\((.*?)\)/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const start = editor.document.positionAt(match.index);
            const end = editor.document.positionAt(match.index + match[0].length);
            if (position.isAfterOrEqual(start) && position.isBeforeOrEqual(end)) {
                const [, type, name, rawParams] = match;
                const params = rawParams.split(',').map(p => p.trim()).filter(Boolean);

                const doc = [
                    `/*/ {Protheus.doc}`,
                    `Descrição: Descreva aqui o propósito da função.`,
                    `@type ${type.toLowerCase()}`,
                    `@since ${new Date().toLocaleDateString()}`,
                    `@version 1.0`,
                    ...params.map(p => `@param ${p}, Tipo desconhecido, Descrição`),
                    `@return Tipo, Descrição`,
                    `@example`,
                    `Exemplo de uso da função.`,
                    `@see Referências adicionais.`,
                    `/*/`
                ].join('\n');

                editor.edit(builder => {
                    builder.insert(start, doc + '\n');
                });

                vscode.window.showInformationMessage(`Documentação gerada para a função "${name}".`);
                return;
            }
        }

        vscode.window.showErrorMessage('Nenhuma função encontrada na posição atual.');
    });

    context.subscriptions.push(generateDocCmd);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
