# Crivo Finance — aplicativo pessoal

Sistema para uso de uma pessoa, concebido para iPhone e computador. Visual escuro, branco e verde-limão, com estilo de vidro translúcido.

## O que já está implementado

- Início: saldo disponível, saldo geral, valores recebidos/pagos, previsão, calendário e avisos.
- Movimentações: salário, freelancer, outras entradas, compras, despesas à vista e futuras.
- Parcelas: cálculos exatos em centavos, cartão e compras parceladas fora do cartão.
- Cartões: limite, fechamento, vencimento e pagamento integral da fatura.
- Contas: despesas recorrentes e entradas fixas mensais.
- Metas: reservas e retiradas sem alterar o patrimônio total.
- Relatórios: meses/anos, categorias, comparações, essenciais/não essenciais e exportação de planilha.
- Configurações: categorias, cartões, senha e notificações.
- Acesso: uma senha individual, armazenada protegida; sessão expira em 30 dias.
- Armazenamento permanente no Neon, ligado à Vercel. Se ele não estiver configurado, o aplicativo não salva dados.
- App instalável na Tela de Início do iPhone e avisos com verificação diária.

## Como publicar

Leia **LEIA-ME.txt** e abra **configurar-acesso.html** para preparar sua senha. Não compartilhe suas configurações pessoais. O aplicativo inicia sem valores financeiros cadastrados (R$ 0,00). Os exemplos do arquivo de demonstração não entram no aplicativo real.

## Conferência feita

11 testes automáticos passaram para valores, vencimentos, datas, parcelas e ajuste de centavos. Navegação e cadastro de compras foram testados em 320, 390 e 1440 pixels com respostas de exemplo; não houve corte lateral. O salvamento de todas as parcelas da mesma compra acontece em uma única operação para evitar cadastros incompletos. Compras à vista no Pix, dinheiro e débito são confirmadas imediatamente; compras parceladas aguardam a confirmação do pagamento. O código do projeto foi verificado, mas o armazenamento real, a publicação e o envio de notificações somente poderão ser testados após a ativação na sua conta Vercel.

## Observações sobre os avisos

Os avisos internos funcionam pelas datas cadastradas. As notificações no iPhone precisam que o usuário abra o endereço no Safari, escolha **Adicionar à Tela de Início**, entre pelo ícone e permita notificações. A rotina diária da Vercel usa horário UTC e o envio não é garantido em horário exato. A Vercel e o Neon podem impor limites conforme o plano escolhido.
