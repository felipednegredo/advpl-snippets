const vscode = require('vscode');

function collectFunctions(text) {
    const functions = [];
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

        functions.push(item);
    }
    return functions;
}

function collectVariables(text) {
    const variables = [];
    const regex = /\b(LOCAL|STATIC|PUBLIC|PRIVATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:=\s*(.+))?/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [type, name, value] = [match[1].toUpperCase(), match[2], match[3]];
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
        item.detail = `${type} - ${value ? `Valor inicial: ${value}` : 'Sem valor inicial'}`;
        item.documentation = new vscode.MarkdownString(`**Escopo:** ${type}\n${value ? `**Valor inicial:** \`${value.trim()}\`` : ''}`);
        
        // Permitir sugestões parciais
        item.filterText = name.toLowerCase();

        variables.push(item);
    }
    return variables;
}

function collectClasses(classesData) {
    const classes = [];
    for (const [className, classInfo] of Object.entries(classesData)) {
        const item = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
        item.detail = `Classe: ${classInfo.description}`;
        item.documentation = new vscode.MarkdownString(`**Descrição:** ${classInfo.description}`);
        
        // Permitir sugestões parciais
        item.filterText = className.toLowerCase();

        classes.push(item);
    }
    return classes;
}

function collectDefines(text) {
    const defines = [];
    const regex = /#DEFINE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [name, value] = [match[1], match[2]];
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
        item.detail = `Define - Valor: ${value}`;
        item.documentation = new vscode.MarkdownString(`**Define:** ${name}\n**Valor:** \`${value}\``);
        defines.push(item);
    }
    return defines;
}

module.exports = {
    collectFunctions,
    collectVariables,
    collectClasses,
    collectDefines
};