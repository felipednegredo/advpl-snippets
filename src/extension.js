const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

let descriptions = {};
let classesData = {};
let cache = null;

function activate(context) {
    descriptions = loadJson('functionsDescriptions.json', true);
    classesData = loadJson('classesMethods.json');

    context.subscriptions.push(
        vscode.commands.registerCommand('advplSnippets.showServers', () => showServersWebView(context)),
        vscode.commands.registerCommand('advplSnippets.generateDocumentation', generateDocumentation),
        registerHoverProvider(),
        registerCompletionProvider()
    );
}

function deactivate() {}

function loadJson(fileName, toLowerCaseKeys = false) {
    try {
        const filePath = path.join(__dirname, fileName);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        return toLowerCaseKeys
            ? Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k.toLowerCase(), v]))
            : parsed;
    } catch (error) {
        console.error(`Erro ao carregar ${fileName}:`, error.message);
        return {};
    }
}

function showServersWebView(context) {
    const panel = vscode.window.createWebviewPanel(
        'serverView',
        'Servers View',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const filePath = getServerConfigFile();
    const data = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '{}';

    panel.webview.html = getWebviewContent(data);

    panel.webview.onDidReceiveMessage(
        (message) => {
            const filePath = getServerConfigFile();
            const data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { configurations: [] };
    
            switch (message.command) {
                case 'delete':
                    data.configurations.splice(message.index, 1);
                    break;
                case 'duplicate':
                    const duplicateConfig = { ...data.configurations[message.index] };
                    data.configurations.push(duplicateConfig);
                    break;
                case 'copy':
                    const copiedConfig = JSON.stringify(data.configurations[message.index], null, 4);
                    if (vscode.env.clipboard) {
                        vscode.env.clipboard.writeText(copiedConfig).then(() => {
                            vscode.window.showInformationMessage('Configuração copiada para a área de transferência.');
                        }, (err) => {
                            vscode.window.showErrorMessage('Erro ao copiar para a área de transferência: ' + err.message);
                        });
                    } else {
                        vscode.window.showErrorMessage('Clipboard API não está disponível no ambiente atual.');
                    }
                    break;
                case 'add':
                    vscode.env.clipboard.readText().then((clipboardText) => {
                        try {
                            const newConfig = JSON.parse(clipboardText);
                            if (newConfig && typeof newConfig === 'object') {
                                data.configurations.push(newConfig);
                                vscode.window.showInformationMessage('Configuração adicionada a partir da área de transferência.');
                            } else {
                                vscode.window.showErrorMessage('O conteúdo da área de transferência não é uma configuração válida.');
                            }
                        } catch (err) {
                            vscode.window.showErrorMessage('Erro ao adicionar configuração: O conteúdo da área de transferência não é um JSON válido.');
                        }
                    });
                    break;
                case 'import':
                    vscode.window.showOpenDialog({ filters: { 'JSON Files': ['json'] } }).then((files) => {
                        if (files && files.length > 0) {
                            const importedData = JSON.parse(fs.readFileSync(files[0].fsPath, 'utf8'));
                            data.configurations = data.configurations.concat(importedData.configurations || []);
                        }
                    });
                    break;
            }
    
            fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
            panel.webview.html = getWebviewContent(JSON.stringify(data));
        },
        undefined,
        context.subscriptions
    );
}

function getServerConfigFile() {
    return path.join(getServerConfigPath(), "servers.json");
}

function getServerConfigPath() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
    return isWorkspaceServerConfig()
        ? getVSCodePath()
        : path.join(homeDir, ".totvsls");
}

function isWorkspaceServerConfig() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return false;

    const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
    return fs.existsSync(settingsPath);
}

function getVSCodePath() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return '';
    
    return path.join(workspaceFolders[0].uri.fsPath, '.vscode');
}


function getWebviewContent(jsonData) {
    const configurations = JSON.parse(jsonData).configurations || [];
    const tableRows = configurations.map((config, index) => `
        <tr>
            <td>${config.type || ''}</td>
            <td>${config.name || ''}</td>
            <td>${config.address || ''}</td>
            <td>${config.port || ''}</td>
            <td>${config.username || ''}</td>
            <td>${config.environments ? config.environments.join(', ') : ''}</td>
            <td>${config.environment || ''}</td>
            <td>
                <button onclick="deleteConfig(${index})">Excluir</button>
                <button onclick="duplicateConfig(${index})">Duplicar</button>
                <button onclick="copyConfig(${index})">Copiar</button>
            </td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Servers</title>
        <style>
            body { font-family: sans-serif; padding: 1rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            button { margin: 0 5px; padding: 5px 10px; cursor: pointer; }
        </style>
    </head>
    <body>
        <h1>Servidores Configurados</h1>
        <button onclick="addConfig()">Incluir Novo</button>
        <button onclick="importConfig()">Importar</button>
        <table>
            <thead>
                <tr>
                    <th>Tipo</th>
                    <th>Nome</th>
                    <th>Endereço</th>
                    <th>Porta</th>
                    <th>Usuário</th>
                    <th>Environments</th>
                    <th>Environment</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
        <script>
            const vscode = acquireVsCodeApi();

            function deleteConfig(index) {
                vscode.postMessage({ command: 'delete', index });
            }

            function duplicateConfig(index) {
                vscode.postMessage({ command: 'duplicate', index });
            }

            function addConfig() {
                vscode.postMessage({ command: 'add' });
            }

            function importConfig() {
                vscode.postMessage({ command: 'import' });
            }
        </script>
    </body>
    </html>`;
}

function registerHoverProvider() {
    return vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                const word = document.getText(range)?.toLowerCase();

                if (!word) return null;

                const funcInfo = descriptions[word];
                if (funcInfo) return createHoverFromDescription(word, funcInfo);

                const text = document.getText();
                const userFuncRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
                let match;

                while ((match = userFuncRegex.exec(text)) !== null) {
                    if (match[2].toLowerCase() === word) {
                        const funcStartIndex = match.index;
                        const funcName = match[2];
                        const markdown = new vscode.MarkdownString(`### ${funcName}\nFunção definida pelo usuário.`);

                        // Extract comments above the function
                        const lines = text.substring(0, funcStartIndex).split('\n').reverse();
                        const commentLines = [];
                        for (const line of lines) {
                            if (line.trim().startsWith('/*') || line.trim().startsWith('//')) {
                                commentLines.push(line.trim().replace(/^\/\*+|\/+|^\*+/g, '').trim());
                            } else if (line.trim() === '' || line.trim().startsWith('*')) {
                                commentLines.push(line.trim().replace(/^\*+/g, '').trim());
                            } else {
                                break;
                            }
                        }

                        if (commentLines.length > 0) {
                            markdown.appendMarkdown('\n#### Comentários:\n');
                            markdown.appendMarkdown(commentLines.reverse().join('\n') + '\n');
                        }

                        // Extract parameters from comments
                        const paramRegex = /@param\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*(.+)/gi;
                        const params = [];
                        for (const line of commentLines) {
                            let paramMatch;
                            while ((paramMatch = paramRegex.exec(line)) !== null) {
                                params.push(`- \`${paramMatch[1]}\` (${paramMatch[2]}): ${paramMatch[3]}`);
                            }
                        }

                        if (params.length > 0) {
                            markdown.appendMarkdown('\n#### Parâmetros:\n');
                            markdown.appendMarkdown(params.join('\n') + '\n');
                        }

                        // Extract return information from comments
                        const returnRegex = /@return\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*(.+)/gi;
                        const returnInfo = [];
                        for (const line of commentLines) {
                            let returnMatch;
                            while ((returnMatch = returnRegex.exec(line)) !== null) {
                                returnInfo.push(`- (${returnMatch[2]}): ${returnMatch[3]}`);
                            }
                        }

                        if (returnInfo.length > 0) {
                            markdown.appendMarkdown('\n#### Retorno:\n');
                            markdown.appendMarkdown(returnInfo.join('\n') + '\n');
                        }

                        markdown.isTrusted = true;
                        return new vscode.Hover(markdown);
                    }
                }

                return null;
            } catch (err) {
                console.error('Erro no HoverProvider:', err);
                return null;
            }
        }
    });
}

function createHoverFromDescription(word, info) {
    const markdown = new vscode.MarkdownString();
    const title = word.replace(/\b\w/g, char => char.toUpperCase());

    markdown.appendMarkdown(`## ${title}\n${info.description || ''}\n\n`);

    if (info.parameters && Object.keys(info.parameters).length > 0) {
        markdown.appendMarkdown('#### Parâmetros:\n');
        for (const [param, meta] of Object.entries(info.parameters)) {
            markdown.appendMarkdown(`- \`${param}\` (${meta.type}): ${meta.description}\n`);
        }
    }

    markdown.appendMarkdown(info.returns
        ? `\n#### Retorno:\n- (${info.returns.type}): ${info.returns.description}\n`
        : '\nSem retorno.\n'
    );

    if (info.example) {
        markdown.appendMarkdown('\n#### Exemplo:\n');
        markdown.appendCodeblock(info.example, 'advpl');
    }

    if (info.documentation) {
        markdown.appendMarkdown(`\n[Documentação completa](${info.documentation})\n`);
    }

    markdown.isTrusted = true;
    return new vscode.Hover(markdown);
}

function registerCompletionProvider() {
    return vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document) {
                if (cache) return getCachedItems();

                cache = { functions: [], variables: [], defines: [], classes: [] };
                const text = document.getText();

                collectFunctions(text);
                collectVariables(text);
                collectDefines(text);
                collectClasses();

                return getCachedItems();
            },

            resolveCompletionItem(item) {
                if (item.kind === vscode.CompletionItemKind.Class) {
                    const classInfo = classesData[item.label];
                    if (classInfo && classInfo.methods) {
                        const [methodName] = Object.keys(classInfo.methods);
                        const methodInfo = classInfo.methods[methodName];

                        const methodItem = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Method);
                        methodItem.detail = `Método: ${methodInfo.description}`;
                        methodItem.documentation = new vscode.MarkdownString(`**Descrição:** ${methodInfo.description}`);
                        methodItem.insertText = methodInfo.parameters
                            ? new vscode.SnippetString(`${methodName}(${methodInfo.parameters.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                            : `${methodName}()`;

                        return methodItem;
                    }
                }
                return null;
            }
        },
        '.', ':'
    );
}

function getCachedItems() {
    return [...cache.functions, ...cache.variables, ...cache.defines, ...cache.classes];
}

function collectFunctions(text) {
    const regex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [type, name, params] = [match[1], match[2], match[3]];
        const paramList = params ? params.split(',').map(p => p.trim()) : [];

        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
        item.detail = `${type} definida pelo usuário`;
        item.documentation = new vscode.MarkdownString(`**Tipo:** ${type}\n**Parâmetros:** ${paramList.join(', ') || 'Nenhum'}`);
        item.insertText = paramList.length
            ? new vscode.SnippetString(`${name}(${paramList.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
            : `${name}()`;

        cache.functions.push(item);
    }
}

function collectVariables(text) {
    const regex = /\b(LOCAL|STATIC|PUBLIC|PRIVATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:=\s*(.+))?/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [type, name, value] = [match[1].toUpperCase(), match[2], match[3]];
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
        item.detail = `${type} - ${value ? `Valor inicial: ${value}` : 'Sem valor inicial'}`;
        item.documentation = new vscode.MarkdownString(`**Escopo:** ${type}\n${value ? `**Valor inicial:** \`${value.trim()}\`` : ''}`);
        cache.variables.push(item);
    }
}

function collectDefines(text) {
    const regex = /#DEFINE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [name, value] = [match[1], match[2]];
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
        item.detail = `Define - Valor: ${value}`;
        item.documentation = new vscode.MarkdownString(`**Define:** ${name}\n**Valor:** \`${value}\``);
        cache.defines.push(item);
    }
}

function collectClasses() {
    for (const [className, classInfo] of Object.entries(classesData)) {
        const item = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
        item.detail = `Classe: ${classInfo.description}`;
        item.documentation = new vscode.MarkdownString(`**Descrição:** ${classInfo.description}`);
        cache.classes.push(item);
    }
}

function generateDocumentation() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showErrorMessage('Nenhum editor ativo encontrado.');

    const text = editor.document.getText();
    const cursor = editor.selection.active;
    const regex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*.*?RETURN\s+([^\s;]+)/gis;

    let match;
    while ((match = regex.exec(text))) {
        const start = editor.document.positionAt(match.index);
        const end = editor.document.positionAt(match.index + match[0].length);
        if (cursor.isAfterOrEqual(start) && cursor.isBeforeOrEqual(end)) {
            const [type, name, params, returnValue] = [match[1], match[2], match[3], match[4]];
            const paramList = params ? params.split(',').map(p => p.trim()) : [];

            const inferType = (identifier) => {
                const firstChar = identifier.charAt(0).toLowerCase();
                switch (firstChar) {
                    case 'c': return 'caractere';
                    case 'n': return 'numérico';
                    case 'a': return 'array';
                    case 'o': return 'objeto';
                    case 'l': return 'lógico';
                    default: return 'tipo desconhecido';
                }
            };

            const docLines = [
                '/*/ {Protheus.doc}',
                `Descrição: Descreva aqui o propósito da função.`,
                `@type ${type.toLowerCase()}`,
                `@since ${new Date().toLocaleDateString()}`,
                `@version 1.0`,
                ...paramList.map(p => `@param ${p}, ${inferType(p)}, Descrição`),
                `@return ${returnValue}, ${inferType(returnValue)}, Descrição`,
                `@example`,
                `Exemplo de uso da função.`,
                `@see Referências adicionais.`,
                '/*/'
            ];

            editor.edit(builder => {
                builder.insert(start, docLines.join('\n') + '\n');
            });

            vscode.window.showInformationMessage(`Documentação gerada para a função "${name}".`);
            return;
        }
    }

    vscode.window.showErrorMessage('Nenhuma função encontrada na posição atual.');
}

module.exports = { activate, deactivate };
