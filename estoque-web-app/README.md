# Analisador de Giro de Estoque

Aplicação web para interpretar o **Relatório de Giro de Estoque**, calcular a cobertura do estoque em dias e localizar produtos abaixo de 5, 10, 15 e 20 dias.

O processamento acontece no navegador. O relatório não é enviado para um banco de dados ou API.

## Recursos

- Upload de PDF com texto selecionável ou arquivo TXT.
- Opção de colar o texto do relatório.
- Detecção automática do período e da unidade.
- Cálculo da média diária de saída.
- Cálculo dos dias de cobertura do estoque atual.
- Faixas cumulativas abaixo de 5, 10, 15 e 20 dias.
- Busca, filtros por faixa e unidade, ordenação e paginação.
- Cálculo da quantidade necessária para atingir uma meta configurável de estoque.
- Exportação completa para XLSX, sem biblioteca externa de planilhas.
- Exportação da tabela filtrada para CSV.
- Indicação dos trechos que não foram reconhecidos pelo interpretador.
- Layout responsivo para computador, tablet e celular.

## Fórmulas

```text
Média diária = quantidade de saída no período ÷ dias do período

Dias de estoque = estoque atual ÷ média diária

Reposição para a meta = média diária × meta em dias − estoque atual
```

## Publicar no GitHub e Vercel

### 1. Criar o repositório

1. Entre no GitHub.
2. Clique em **New repository**.
3. Escolha um nome, por exemplo `analisador-giro-estoque`.
4. Crie o repositório vazio.
5. Extraia o arquivo ZIP deste projeto.
6. No repositório, clique em **Add file → Upload files**.
7. Envie todo o conteúdo extraído, mantendo as pastas `src`, `public` e `tests`.
8. Confirme em **Commit changes**.

### 2. Publicar na Vercel

1. Entre na Vercel usando sua conta do GitHub.
2. Clique em **Add New → Project**.
3. Importe o repositório criado.
4. A Vercel deve detectar o projeto como **Vite**.
5. Não é necessário configurar variáveis de ambiente.
6. Clique em **Deploy**.

Configuração já incluída:

```text
Build Command: npm run build
Output Directory: dist
Node.js: 22.12 ou superior
```

## Executar localmente, opcional

Requer Node.js 22.12 ou superior.

```bash
npm install
npm run dev
```

Para gerar a versão de produção:

```bash
npm run build
npm run preview
```

Para executar os testes:

```bash
npm test
```

## Estrutura

```text
.
├── public/
│   └── favicon.svg
├── src/
│   ├── app.js
│   ├── parser.js
│   ├── pdf-reader.js
│   ├── styles.css
│   └── xlsx-writer.js
├── tests/
│   ├── parser.test.js
│   └── xlsx.test.js
├── exemplo-relatorio.txt
├── index.html
├── package.json
└── vercel.json
```

## Limitação de PDFs

O PDF precisa possuir texto selecionável. Um documento digitalizado apenas como imagem não pode ser interpretado sem OCR. Nesse caso, exporte o relatório novamente pelo sistema ou utilize uma versão convertida por OCR.

## Adaptação para outros formatos

A lógica de interpretação está concentrada em `src/parser.js`. Caso a prefeitura altere a disposição das colunas ou o formato dos números, esse é o arquivo principal a ser ajustado.
