import { Link } from 'react-router-dom';

// Páginas públicas exigidas pela Play Store: política de privacidade, termos
// de uso e instruções de exclusão de conta. Texto descreve o que o sistema
// realmente faz (ver server/src e deploy/backup-agtgestor.sh).

const CONTACT = 'contato@agentegestor.com.br';
const UPDATED = '2 de outubro de 2026';

const PAGES = {
  privacidade: {
    title: 'Política de Privacidade',
    sections: [
      ['Quem somos', [
        `O AGTGestor (agentegestor.com.br e app Android) é um sistema de agenda e atendimento pelo WhatsApp para pequenos negócios. Dúvidas sobre dados pessoais: ${CONTACT}.`,
      ]],
      ['Dados que coletamos', [
        'Conta: nome, e-mail e senha. A senha é guardada só de forma criptografada (hash).',
        'Negócio: nome, telefone, endereço, horários, serviços, preços, profissionais, logotipo e imagens que você envia.',
        'Clientes do seu negócio: nome, telefone, agendamentos, pedidos e observações. Esses dados entram quando você cadastra ou quando o cliente agenda pelo robô do WhatsApp.',
        'WhatsApp: quando você conecta seu número, guardamos no servidor a sessão do WhatsApp para o robô responder por você. O robô lê as mensagens recebidas para responder e salva só o agendamento ou pedido criado.',
        'Pagamento: no site, o pagamento é feito pela Stripe; no app Android, pelo Google Play. Não recebemos nem guardamos dados de cartão. Guardamos só a situação da assinatura.',
        'O app não usa publicidade, não vende dados e não usa ferramentas de rastreamento de terceiros.',
      ]],
      ['Para que usamos', [
        'Criar e manter sua conta, mostrar sua agenda e loja, responder seus clientes pelo WhatsApp, cobrar a assinatura, enviar e-mails de confirmação e de recuperação de senha, e dar suporte.',
      ]],
      ['Com quem compartilhamos', [
        'Só com serviços necessários para o sistema funcionar: hospedagem do servidor (Hostinger), envio de e-mail, Stripe e Google Play (pagamentos) e WhatsApp/Meta (entrega das mensagens).',
        'Sua loja pública (/loja/seu-endereco) mostra para qualquer pessoa os dados que você decidir publicar: nome do negócio, serviços, preços, imagens e contato.',
      ]],
      ['Dados dos seus clientes', [
        'Para os dados dos clientes do seu negócio, você é o controlador e o AGTGestor é o operador (Lei 13.709/2018, LGPD). Usamos esses dados só para prestar o serviço a você.',
      ]],
      ['Por quanto tempo guardamos', [
        'Enquanto sua conta existir. Ao excluir a conta, os dados são apagados na hora do banco principal. Cópias de segurança são apagadas automaticamente em até 14 dias.',
      ]],
      ['Segurança', [
        'Conexão sempre com HTTPS, senha criptografada, acesso por token e limites contra tentativas repetidas.',
      ]],
      ['Seus direitos', [
        `Você pode acessar e corrigir seus dados no painel, e excluir a conta a qualquer momento. Para outros pedidos da LGPD, escreva para ${CONTACT}.`,
      ]],
      ['Idade', [
        'O AGTGestor é uma ferramenta para negócios e não é destinado a menores de 18 anos.',
      ]],
    ],
  },
  termos: {
    title: 'Termos de Uso',
    sections: [
      ['O serviço', [
        'O AGTGestor oferece agenda, cadastro de serviços, profissionais e clientes, loja online e atendimento automático pelo WhatsApp.',
      ]],
      ['Sua conta', [
        'Você é responsável pelos dados que cadastra, pelo uso do seu número de WhatsApp e por ter autorização para tratar os dados dos seus clientes.',
        'Não use o sistema para enviar spam, conteúdo ilegal ou mensagens que os clientes não pediram.',
      ]],
      ['WhatsApp', [
        'O AGTGestor não é afiliado ao WhatsApp nem à Meta. O WhatsApp pode limitar ou bloquear números que descumprem as regras dele. Use o robô só para responder quem fala com seu negócio.',
      ]],
      ['Assinatura', [
        'Contas novas têm 7 dias de teste grátis. Depois, os recursos premium exigem assinatura mensal.',
        'No site, a assinatura é cobrada pela Stripe e cancelada no próprio painel. No app Android, é cobrada pelo Google Play e cancelada na Play Store. O acesso continua até o fim do período pago.',
      ]],
      ['Encerramento', [
        'Você pode excluir sua conta a qualquer momento em Assinatura e conta. Podemos suspender contas que descumprirem estes termos.',
      ]],
      ['Responsabilidade', [
        'Trabalhamos para manter o serviço no ar, mas ele pode ter interrupções. Não respondemos por perdas causadas por falhas do WhatsApp, da internet ou de serviços de terceiros.',
      ]],
      ['Contato', [`${CONTACT}`]],
    ],
  },
  'excluir-conta': {
    title: 'Excluir sua conta do AGTGestor',
    sections: [
      ['Pelo app ou pelo site', [
        '1. Entre na sua conta.',
        '2. Abra o menu e toque em "Assinatura e conta".',
        '3. No fim da página, toque em "Excluir minha conta" e confirme com sua senha.',
      ]],
      ['O que é apagado', [
        'Conta, loja, serviços, categorias, profissionais, agenda, pedidos, clientes, imagens e a sessão do WhatsApp. A exclusão é imediata e não pode ser desfeita. Cópias de segurança somem em até 14 dias.',
      ]],
      ['Assinatura', [
        'Se você assinou pelo Google Play, cancele também na Play Store (Pagamentos e assinaturas). Assinaturas feitas no site são canceladas junto com a conta.',
      ]],
      ['Sem acesso à conta?', [
        `Escreva para ${CONTACT} pelo e-mail cadastrado pedindo a exclusão. Respondemos em até 7 dias.`,
      ]],
    ],
  },
};

export default function LegalPage({ page }) {
  const content = PAGES[page];
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 64px', color: 'var(--text-primary)', lineHeight: 1.7 }}>
      <Link to="/" style={{ display: 'inline-block', marginBottom: '32px' }}>
        <img src="/agtgestor-logo.svg" alt="AGTGestor" style={{ height: 28 }} />
      </Link>
      <h1 style={{ marginBottom: '8px' }}>{content.title}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Atualizado em {UPDATED}</p>
      {content.sections.map(([heading, paragraphs]) => (
        <section key={heading} style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>{heading}</h2>
          {paragraphs.map((text) => (
            <p key={text} style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>{text}</p>
          ))}
        </section>
      ))}
      <nav style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '40px', fontSize: '0.9rem' }}>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/termos">Termos de Uso</Link>
        <Link to="/excluir-conta">Excluir conta</Link>
      </nav>
    </main>
  );
}
