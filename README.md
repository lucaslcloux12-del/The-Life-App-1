# The Life App

Aplicação web de jogo com economia virtual, carreiras, cassino de créditos, banco interno, cartões, investimentos, criptoativos, lojas, inventário, Pix, transferências, cheques e painel do proprietário.

**Stack:** HTML, CSS, JavaScript ES Modules e Firebase Authentication + Realtime Database. Não usa Firestore, Storage, Cloud Functions ou servidor próprio. Pode ser hospedado como site estático no GitHub Pages.

## O que vem no projeto

- 120 trabalhos: serviços rápidos de 5 minutos, carreiras profissionais de 10 a 50 minutos e missões de fortuna de 1 a 3 horas.
- Progresso de trabalho gravado por horário de início. A contagem continua enquanto a página está fechada; ao retornar, o jogo calcula o tempo decorrido.
- 130 lojas, 130 produtos e 72 cartões virtuais com níveis, valores, limites e estilos diferentes.
- Cassino de cores com apostas solo e mesas de duelo entre jogadores.
- Carteira, saldo bancário, cofrinho com rendimento simulado, extrato, investimentos, criptoativos, Pix sem taxa, transferências comuns com taxa/prazo e cheques.
- Login com Google, e-mail/senha ou nome de usuário/senha.
- Painel proprietário reconhecido pela autenticação Firebase e pelas regras do Realtime Database.
- Interface responsiva para desktop e celular, central de apps internos, animações e layout de luxo.

> Todos os saldos, investimentos, cartões e prêmios são virtuais e não têm valor monetário real. Não há depósito, saque ou conversão para dinheiro de verdade.

## 1. Configure o Firebase

Abra o projeto `the-life-app-11043` no Firebase Console.

### Authentication

1. Entre em **Authentication → Sign-in method**.
2. Ative **Email/Password**.
3. Ative **Google** e escolha um e-mail de suporte, se o Console solicitar.
4. Em **Authentication → Settings → Authorized domains**, adicione o domínio que o GitHub Pages usar para seu site. Para um repositório de usuário, costuma ser `seuusuario.github.io`; para um repositório de projeto, também use o domínio `seuusuario.github.io` e publique no caminho do repositório.

### Realtime Database

1. Em **Build → Realtime Database**, crie ou abra o banco.
2. Copie a URL exata mostrada no Console.
3. Abra `firebase-config.js` e confira a propriedade `databaseURL`. O projeto está preenchido com a URL padrão `https://the-life-app-11043-default-rtdb.firebaseio.com`; se o Console exibir outra URL (por exemplo, uma com região `firebasedatabase.app`), substitua pela URL exata.
4. Na aba **Rules**, cole o conteúdo inteiro de `database.rules.json` e publique as regras.

As regras permitem que cada usuário leia e edite seu próprio registro, expõem somente perfis públicos para o ranking e autorizam a conta `lucaslcloux12@gmail.com` a administrar o banco inteiro. O proprietário precisa entrar com essa conta pelo Google ou pelo provedor de e-mail/senha correspondente.

**Importante:** não substitua as regras por `.read: true` e `.write: true`. Isso deixaria os dados de todos os jogadores públicos e editáveis por qualquer pessoa.

## 2. Publique no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta para a raiz do repositório: `index.html`, `styles.css`, `app.js`, `catalog.js`, `firebase-config.js` e `database.rules.json`.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**, escolha a branch principal e a pasta `/ (root)`.
5. Salve e abra a URL gerada pelo GitHub Pages.
6. Se aparecer `auth/unauthorized-domain`, volte ao Firebase Authentication e autorize o domínio da página publicada.

Não é necessário instalar Node, usar npm ou compilar o site. Os módulos Firebase são carregados pelo CDN.

### Se ficar preso na tela de carregamento

A versão atual possui um monitor de inicialização: se o código do jogo não iniciar, a tela informa o problema depois de 20 segundos em vez de ficar carregando indefinidamente. Se isso acontecer, veja a primeira mensagem vermelha em **F12 → Console**. Confirme também que está acessando o site pelo endereço HTTPS do GitHub Pages (não abrindo `index.html` via `file://`) e que `app.js`, `catalog.js` e `firebase-config.js` estão publicados na mesma pasta de `index.html`. Depois de enviar alterações ao repositório, atualize a página com **Ctrl + F5**. Uma falha de importação dos módulos do Firebase também pode indicar bloqueio de rede, extensão do navegador ou indisponibilidade do CDN.

## 3. Como funciona o login por nome de usuário

O Firebase Authentication oferece autenticação por e-mail/senha e Google. Para suportar o modo “nome de usuário/senha” sem manter uma tabela pública de e-mails, o projeto transforma internamente o nome em um identificador de autenticação no domínio sintético `username.thelifeapp.app`. Esse identificador não é uma caixa de e-mail real. A pessoa precisa entrar usando o modo **Nome de usuário** e o nome exato com que criou a conta.

## 4. Conta proprietária

A conta `lucaslcloux12@gmail.com` recebe o botão **Administração**. No painel, é possível selecionar qualquer jogador, editar o JSON completo do estado do jogo, ajustar saldos e nível, aplicar uma fortuna de teste e configurar multiplicadores/regras econômicas.

A permissão não depende apenas de um botão escondido na página: `database.rules.json` também confere o e-mail autenticado para liberar acesso total. Não compartilhe a senha dessa conta.

## 5. Limites importantes do plano Spark e da versão estática

O site usa os recursos compatíveis com Firebase Spark que foram solicitados: Authentication e Realtime Database. Como a lógica econômica roda no navegador e não existe um servidor confiável/Cloud Function validando cada operação, esta é uma versão funcional de jogo, mas não um sistema antitrapaça: um usuário determinado pode tentar manipular o próprio saldo por ferramentas do navegador. As regras impedem que um usuário comum escreva diretamente nos registros privados de outros jogadores, mas não conseguem validar com segurança todas as fórmulas de trabalho/cassino executadas no cliente.

Para uma economia multiplayer realmente resistente a fraude, a liquidação de salários, apostas, transferências e duelos precisaria ser movida para código de servidor confiável. Não habilite dinheiro real nem trate os valores virtuais como saldo financeiro.

## 6. Notas de desenvolvimento

- `catalog.js`: dados de trabalhos, cartões, lojas, produtos, investimentos e ativos virtuais.
- `app.js`: autenticação, renderização, sincronização, mecânicas e operações.
- `styles.css`: interface, responsividade, cartões e animações.
- `firebase-config.js`: configuração do Firebase e e-mail do proprietário.
- `database.rules.json`: regras do Realtime Database.

Se editar o catálogo, mantenha os IDs únicos para não misturar objetos comprados ou trabalhos em andamento.
