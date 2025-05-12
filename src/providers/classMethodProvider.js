const vscode = require('vscode');

function registerClassMethodCompletion(classesMethods) {

    return vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'advpl' },
    {
      provideCompletionItems(document, position) {
        const line = document.lineAt(position).text.substring(0, position.character);
        // Detecta padrão <variavel>:
        const varMatch = /([a-zA-Z_][\w]*)\s*:$/.exec(line);
        if (!varMatch) {
          return;
        }
        const varName = varMatch[1];
        const fullText = document.getText();
        // Busca declaração: oVar := ClassName:New(
        const assignRegex = new RegExp(`\\b${varName}\\s*[:=]+\\s*([A-Z][\\w]*):New`, 'g');
        let classMatch;
        let className;
        while ((classMatch = assignRegex.exec(fullText)) !== null) {
          className = classMatch[1]; // pega a última ocorrência
        }
        if (!className) {
          return;
        }
        const methods = classesMethods[className];
        if (!Array.isArray(methods)) {
          return;
        }
        // Cria sugestões de métodos
        return methods.map(method => {
          const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Method);
          item.insertText = new vscode.SnippetString(`${method}($0)`);
          item.detail = `${className} method`;
          return item;
        });
      }
    },
    ':' // ativa apenas ao digitar dois-pontos
  );

}

module.exports = { registerClassMethodCompletion };