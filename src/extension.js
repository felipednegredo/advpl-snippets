const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const homedir = require("os").homedir();

let descriptions = {};
let classesData = {};
let cache = null;

function activate(context) {
    descriptions = loadJson('functionsDescriptions.json', true);
    classesData = loadJson('classesMethods.json');

    context.subscriptions.push(
        vscode.commands.registerCommand('advplSnippets.showServers', () => showServersWebView(context)),
        vscode.commands.registerCommand('advplSnippets.showLaunch', () => showLaunchWebView(context)),
        vscode.commands.registerCommand('advplSnippets.generateDocumentation', generateDocumentation),
        registerHoverProvider(),
        registerCompletionProvider(),
        createHoverFromDescription()
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
        'servidoresConfigurados',
        'Servidores Configurados',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const filePath = getServerConfigFile();
    let jsonData;

    try {
        jsonData = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
            : { configurations: [] };
    } catch (err) {
        vscode.window.showErrorMessage('Erro ao ler arquivo de configurações: ' + err.message);
        jsonData = { configurations: [] };
    }

    const htmlPath = path.join(context.extensionPath, 'src', 'webviews', 'servers.html');
    const htmlTemplate = fs.readFileSync(htmlPath, 'utf8');
    panel.webview.html = htmlTemplate;

    // Quando a WebView estiver pronta, envie os dados
    panel.webview.onDidReceiveMessage(
        (message) => {
            switch (message.command) {
                case 'ready':
                    panel.webview.postMessage({ configurations: jsonData.configurations });
                    return;

                case 'delete':
                    jsonData.configurations.splice(message.index, 1);
                    break;

                case 'duplicate': {
                    const original = jsonData.configurations[message.index];
                    const duplicate = { ...original };
                    const baseName = duplicate.name || 'Duplicated Config';
                    let newName = baseName;
                    let count = 1;

                    while (jsonData.configurations.some(cfg => cfg.name === newName)) {
                        newName = `${baseName} (${count++})`;
                    }

                    duplicate.name = newName;
                    jsonData.configurations.push(duplicate);
                    break;
                }

                case 'copyConfig': {
                    const configText = JSON.stringify(jsonData.configurations[message.index], null, 4);
                    (async () => {
                        try {
                            await vscode.env.clipboard.writeText(configText);
                            vscode.window.showInformationMessage('Configuração copiada para a área de transferência.');
                        } catch (err) {
                            vscode.window.showErrorMessage('Erro ao copiar: ' + err.message);
                        }
                    })();
                    break;
                }
                
                case 'add':
                    vscode.env.clipboard.readText().then(text => {
                        try {
                            const newConfig = JSON.parse(text);
                            if (typeof newConfig === 'object') {
                                jsonData.configurations.push(newConfig);
                                vscode.window.showInformationMessage('Configuração adicionada da área de transferência.');
                                update();
                            } else {
                                vscode.window.showErrorMessage('Conteúdo inválido na área de transferência.');
                            }
                        } catch (err) {
                            vscode.window.showErrorMessage('Erro: conteúdo da área de transferência não é JSON válido.');
                        }
                    });
                    return;

                case 'import':
                    vscode.window.showOpenDialog({ filters: { 'JSON Files': ['json'] } }).then(files => {
                        if (files && files.length > 0) {
                            try {
                                const imported = JSON.parse(fs.readFileSync(files[0].fsPath, 'utf8'));
                                jsonData.configurations = jsonData.configurations.concat(imported.configurations || []);
                                update();
                            } catch (err) {
                                vscode.window.showErrorMessage('Erro ao importar arquivo: ' + err.message);
                            }
                        }
                    });
                    return;
            }

            fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 4));
            update();
        },
        undefined,
        context.subscriptions
    );

    function update() {
        panel.webview.postMessage({ configurations: jsonData.configurations });
    }
}


function getServerConfigFile() {
    return path.join(getServerConfigPath(), "servers.json");
}

function getServerConfigPath() {
    return isWorkspaceServerConfig()
      ? getVSCodePath()
      : path.join(homedir, "/.totvsls");
}

function showLaunchWebView(context) {
    const panel = vscode.window.createWebviewPanel(
        'configuracoesDebug',
        'Configurações de Debug',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const filePath = getLaunchConfigFile();
    let jsonData;

    try {
        jsonData = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
            : { configurations: [] };
    } catch (err) {
        vscode.window.showErrorMessage('Erro ao ler arquivo de configurações: ' + err.message);
        jsonData = { configurations: [] };
    }

    const htmlPath = path.join(context.extensionPath, 'src', 'webviews', 'launch.html');
    const htmlTemplate = fs.readFileSync(htmlPath, 'utf8');
    panel.webview.html = htmlTemplate;

    panel.webview.onDidReceiveMessage(
        (message) => {
            const filePath = getLaunchConfigFile();
            const data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { configurations: [] };

            switch (message.command) {
                case 'delete':
                    data.configurations.splice(message.index, 1);
                    break;
                case 'copyConfig':
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
                    data.configurations.push({
                        name: 'Nova Configuração',
                        type: 'node',
                        request: 'launch',
                        program: '${workspaceFolder}/app.js'
                    });
                    break;
                case 'edit':
                    const config = data.configurations[message.index];
                    config[message.key] = message.value;
                    break;
            }

            fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
            update();
        },
        undefined,
        context.subscriptions
    );

    function update() {
        panel.webview.postMessage({ configurations: jsonData.configurations });
    }
}

function getLaunchConfigFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return '';
    return path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'launch.json');
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

function registerHoverProvider() {
    return vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                const word = document.getText(range)?.toLowerCase();

                if (!word) return null;

                const text = document.getText();
                const userFuncRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
                let match;

                while ((match = userFuncRegex.exec(text)) !== null) {
                    if (match[2].toLowerCase() === word) {
                        const funcStartIndex = match.index;
                        const funcName = match[2];
                        const markdown = new vscode.MarkdownString(`### ${funcName}\nFunção definida pelo usuário.`);

                        // Extrair comentários acima da função
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

                        // Extrair parâmetros dos comentários
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

                        // Extrair informações de retorno dos comentários
                        const returnRegex = /@return\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*(.+)/gi;
                        const returnInfo = [];
                        for (const line of commentLines) {
                            let returnMatch;
                            while ((returnMatch = returnRegex.exec(line)) !== null) {
                                returnInfo.push(`- \`${returnMatch[1]}\` (${returnMatch[2]}): ${returnMatch[3]}`);
                            }
                        }

                        if (returnInfo.length > 0) {
                            markdown.appendMarkdown('\n#### Retorno:\n');
                            markdown.appendMarkdown(returnInfo.join('\n') + '\n');
                        }

                        // Extrair exemplo dos comentários
                        const exampleRegex = /@example\s*(.+)/gi;
                        const examples = [];
                        for (const line of commentLines) {
                            let exampleMatch;
                            while ((exampleMatch = exampleRegex.exec(line)) !== null) {
                                examples.push(exampleMatch[1]);
                            }
                        }

                        if (examples.length > 0) {
                            markdown.appendMarkdown('\n#### Exemplo:\n');
                            markdown.appendMarkdown(examples.join('\n') + '\n');
                        }

                        // Extrair referências dos comentários
                        const seeRegex = /@see\s*(.+)/gi;
                        const references = [];
                        for (const line of commentLines) {
                            let seeMatch;
                            while ((seeMatch = seeRegex.exec(line)) !== null) {
                                references.push(`- ${seeMatch[1]}`);
                            }
                        }

                        if (references.length > 0) {
                            markdown.appendMarkdown('\n#### Referências:\n');
                            markdown.appendMarkdown(references.join('\n') + '\n');
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

        // Permitir sugestões parciais
        item.filterText = name.toLowerCase();

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
        
        // Permitir sugestões parciais
        item.filterText = name.toLowerCase();

        cache.variables.push(item);
    }
}

function collectClasses() {
    for (const [className, classInfo] of Object.entries(classesData)) {
        const item = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
        item.detail = `Classe: ${classInfo.description}`;
        item.documentation = new vscode.MarkdownString(`**Descrição:** ${classInfo.description}`);
        
        // Permitir sugestões parciais
        item.filterText = className.toLowerCase();

        cache.classes.push(item);
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

function generateDocumentation() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showErrorMessage('Nenhum editor ativo encontrado.');

    const text = editor.document.getText();
    const cursor = editor.selection.active;

    // Regex para funções
    const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gis;

    // Regex para defines
    const defineRegex = /#DEFINE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)/gi;

    let match;

    // Verificar se o cursor está em uma função
    while ((match = functionRegex.exec(text))) {
        const start = editor.document.positionAt(match.index);
        const end = editor.document.positionAt(match.index + match[0].length);
        if (cursor.isAfterOrEqual(start) && cursor.isBeforeOrEqual(end)) {
            const [type, name, params] = [match[1], match[2], match[3]];
            const paramList = params ? params.split(',').map(p => p.trim()) : [];

            // Procurar o retorno da função
            const functionBodyStart = match.index + match[0].length;
            const functionBody = text.substring(functionBodyStart, text.indexOf('END FUNCTION', functionBodyStart));
            const returnMatch = /\bRETURN\s+([^\s;]+)/i.exec(functionBody);
            const returnValue = returnMatch ? returnMatch[1] : null;

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
                returnValue ? `@return ${returnValue}, ${inferType(returnValue)}, Descrição` : '',
                `@example`,
                `Exemplo de uso da função.`,
                `@see Referências adicionais.`,
                '/*/'
            ].filter(line => line); // Remove linhas vazias

            editor.edit(builder => {
                builder.insert(start, docLines.join('\n') + '\n');
            });

            vscode.window.showInformationMessage(`Documentação gerada para a função "${name}".`);
            return;
        }
    }

    // Verificar se o cursor está em um define
    while ((match = defineRegex.exec(text))) {
        const start = editor.document.positionAt(match.index);
        const end = editor.document.positionAt(match.index + match[0].length);
        if (cursor.isAfterOrEqual(start) && cursor.isBeforeOrEqual(end)) {
            const [name, value] = [match[1], match[2]];

            const docLines = [
                '/*/ {Protheus.doc}',
                `Descrição: Descreva aqui o propósito do define.`,
                `@define ${name}`,
                `@value ${value}`,
                `@since ${new Date().toLocaleDateString()}`,
                `@example`,
                `Exemplo de uso do define.`,
                `@see Referências adicionais.`,
                '/*/'
            ];

            editor.edit(builder => {
                builder.insert(start, docLines.join('\n') + '\n');
            });

            vscode.window.showInformationMessage(`Documentação gerada para o define "${name}".`);
            return;
        }
    }

    vscode.window.showErrorMessage('Nenhuma função ou define encontrada na posição atual.');
}

module.exports = { activate, deactivate };
