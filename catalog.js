const quickJobs = [
  "Assistente de arquivo", "Auxiliar de cafeteria", "Entregador urbano", "Organizador de estoque", "Atendente de cinema", "Auxiliar de biblioteca", "Recepcionista júnior", "Separador de pedidos", "Monitor de estacionamento", "Auxiliar de lavanderia",
  "Operador de caixa", "Atendente de padaria", "Apoio de eventos", "Mensageiro corporativo", "Revisor de cadastros", "Auxiliar de floricultura", "Assistente de pet shop", "Fotocopiador profissional", "Agente de pesquisa local", "Assistente de embalagem",
  "Auxiliar de hotelaria", "Conferente de mercadorias", "Atendente de coworking", "Organizador de vitrines", "Assistente de salão", "Auxiliar de estúdio", "Inspetor de qualidade júnior", "Assistente de inventário", "Operador de quiosque", "Auxiliar de logística"
];
const proJobs = [
  "Analista de operações", "Designer de marcas", "Desenvolvedor front-end", "Consultor comercial", "Especialista de suporte", "Técnico de redes", "Gestor de comunidade", "Produtor de conteúdo", "Analista de dados", "Fotógrafo publicitário",
  "Editor de vídeo", "Gestor de tráfego", "Redator estratégico", "Analista financeiro", "Corretor imobiliário", "Organizador de casamentos", "Chef executivo", "Gerente de hotel", "Técnico de automação", "Especialista em segurança digital",
  "Engenheiro de software", "Consultor de investimentos", "Arquiteto residencial", "Gerente de produto", "Diretor de arte", "Produtor musical", "Piloto executivo", "Advogado empresarial", "Médico plantonista", "Engenheiro civil",
  "Gerente de e-commerce", "Auditor corporativo", "Especialista tributário", "Consultor de luxo", "Agente de talentos", "Gerente de frota", "Estrategista de marca", "Especialista em cibersegurança", "Designer de interiores", "Analista de mercado",
  "Gerente de operações", "Desenvolvedor de jogos", "Consultor de expansão", "Produtor de documentários", "Engenheiro de dados", "Especialista em IA", "Diretor de fotografia", "Gestor de patrimônio", "Corretor de aeronaves", "Consultor de hospitalidade",
  "Gerente de relações públicas", "Especialista de logística", "Engenheiro ambiental", "Diretor de vendas", "Analista quantitativo", "Arquiteto de soluções", "Gestor de eventos internacionais", "Consultor de fusões", "Diretor criativo", "Gerente de inovação"
];
const fortuneJobs = [
  "Diretor de banco privado", "Sócio de fundo global", "Fundador de tecnologia", "Investidor de infraestrutura", "Magnata imobiliário", "Presidente de conglomerado", "Dono de rede hoteleira", "Diretor de fundo de hedge", "Investidor de energia limpa", "Proprietário de companhia aérea",
  "Conselheiro de multinacional", "Gestor de capital soberano", "Desenvolvedor de megaprojetos", "Presidente de holding", "Investidor de biotecnologia", "Fundador de rede logística", "Diretor de mineração premium", "Dono de marca global", "Arquiteto de cidade inteligente", "Investidor de portos privados",
  "Controlador de grupo financeiro", "Líder de aquisição global", "Construtor de ilha privada", "Patrocinador de campeonato mundial", "Fundador de império de luxo", "Presidente de fundo internacional", "Investidor aeroespacial", "Dono de resort exclusivo", "Negociador de megafusões", "Chairman de grupo internacional"
];

const makeJob = (title, index, tier) => {
  const quick = tier === "quick";
  const pro = tier === "pro";
  const durationMin = quick ? 5 : pro ? 10 + (index % 9) * 5 : 60 + (index % 5) * 30;
  const minPay = quick ? 260 + (index % 7) * 65 : pro ? 2800 + (index % 10) * 2300 : 95000 + (index % 10) * 85000;
  const maxPay = quick ? minPay + 250 + (index % 5) * 70 : pro ? minPay + 4000 + (index % 6) * 1800 : minPay + 125000 + (index % 6) * 110000;
  const challenge = index % (quick ? 7 : pro ? 5 : 3) === 2;
  const hard = tier === "fortune" || (pro && index % 4 === 1);
  const sectors = quick ? ["Serviços", "Comércio", "Logística", "Hospitalidade"] : pro ? ["Tecnologia", "Negócios", "Criação", "Serviços especializados"] : ["Alta gestão", "Investimentos", "Infraestrutura", "Empreendedorismo"];
  return {
    id: `${tier}-${String(index + 1).padStart(3, "0")}`,
    title,
    tier,
    durationMin,
    minPay,
    maxPay,
    challenge,
    difficulty: hard ? "Alta" : challenge ? "Técnica" : "Moderada",
    sector: sectors[index % sectors.length],
    company: ["Aureon Group", "Vértice Holdings", "Northstar Labs", "Monarch Collective", "Avelar & Co.", "Orion Capital"][index % 6],
    offline: !challenge || index % 2 === 0,
    description: quick ? "Uma oportunidade rápida para movimentar seu saldo." : pro ? "Responsabilidade profissional, remuneração proporcional." : "Uma missão de alto impacto para ampliar seu patrimônio."
  };
};
export const JOBS = [
  ...quickJobs.map((title, i) => makeJob(title, i, "quick")),
  ...proJobs.map((title, i) => makeJob(title, i, "pro")),
  ...fortuneJobs.map((title, i) => makeJob(title, i, "fortune"))
];

const shopCategories = [
  { id: "imoveis", name: "Imóveis", stores: ["Aurea Estates", "Monarch Residences", "Skyline Prime", "Maison Royale", "Crown Properties", "Vértice Urban", "Opaline Mansions", "Northstar Realty", "Luxe Habitat", "Atlas Developments"], products: ["Studio central", "Apartamento Signature", "Cobertura panorâmica", "Casa contemporânea", "Mansão à beira-mar", "Penthouse imperial", "Propriedade rural", "Villa privativa", "Ilha residencial", "Complexo de residências"] , base: 280000},
  { id: "carros", name: "Automóveis", stores: ["Velocity Atelier", "Blackline Motors", "Crown Automotive", "Apex Performance", "Monarch Garage", "Aureon Autohaus", "Vanta Supercars", "Grand Touring Co.", "Silverstone Motors", "Northstar Classics"], products: ["Sedã executivo", "Cupê esportivo", "SUV premium", "Elétrico Signature", "Grand tourer", "Superesportivo V12", "Clássico restaurado", "Hypercar limitado", "Limusine presidencial", "Coleção automotiva"] , base: 145000},
  { id: "avioes", name: "Aviação", stores: ["AeroLux Executive", "Jetline Aviation", "Crown Airworks", "Skylark Jets", "Aureon Aviation", "Monarch Flight", "Bluecrest Air", "Northstar Aero", "Vértice Jets", "Altitude Private"], products: ["Cota de hangar", "Ultraleve premium", "Helicóptero executivo", "Turboélice privado", "Jato leve", "Jato supermédio", "Jato de longo alcance", "Aeronave VIP", "Jato intercontinental", "Frota aérea executiva"], base: 1800000},
  { id: "nautica", name: "Náutica", stores: ["Azure Yacht House", "Marina Monarch", "Bluecrest Marine", "Aureon Yachting", "Oceanline Luxury", "Crown Nautical", "Sapphire Fleet", "Northstar Marine", "Vela Privée", "Atlantic Signature"], products: ["Lancha esportiva", "Veleiro de luxo", "Catamarã premium", "Iate costeiro", "Iate de expedição", "Superiate", "Iate oceânico", "Frota de marina", "Navio de lazer", "Ilha flutuante privada"], base: 520000},
  { id: "negocios", name: "Empresas", stores: ["Aureon Ventures", "Monarch Acquisitions", "Northstar Enterprises", "Vértice Partners", "Crown Business Exchange", "Atlas Holdings", "Opaline Ventures", "Blackstone Avenue", "Meridian Capital House", "Summit Enterprise"], products: ["Quiosque licenciado", "Cafeteria boutique", "Estúdio criativo", "Restaurante autoral", "Agência digital", "Hotel design", "Rede de lojas", "Centro logístico", "Grupo de franquias", "Holding diversificada"], base: 85000},
  { id: "tecnologia", name: "Tecnologia", stores: ["Nexora Systems", "Circuit Privé", "Aureon Digital", "Monarch Tech", "Quantum House", "Northstar Devices", "Vanta Computing", "Vertex Electronics", "Signal One", "Opaline Innovation"], products: ["Setup profissional", "Notebook Creator", "Workstation de dados", "Estação de IA", "Sala de streaming", "Laboratório de pesquisa", "Servidor privado", "Supercomputador", "Centro de dados", "Campus tecnológico"], base: 6500},
  { id: "moda", name: "Moda", stores: ["Maison Aveline", "Opaline Couture", "Crown Atelier", "Vanta Collection", "Aureon Fashion House", "Monarch Wardrobe", "Noir Signature", "Velours Privé", "Northstar Tailoring", "Élan Gallery"], products: ["Alfaiataria sob medida", "Bolsa de edição limitada", "Coleção couture", "Relógio de passarela", "Joia de assinatura", "Guarda-roupa completo", "Coleção de arquivo", "Look de gala", "Ateliê particular", "Linha de moda própria"], base: 2400},
  { id: "relogios", name: "Relógios e joias", stores: ["Aureon Horology", "Crown & Carat", "Maison Opaline", "Monarch Timepieces", "Noir Joaillerie", "Vértice Watches", "Northstar Gems", "Velvet Crown", "Sapphire Vault", "Élan Joailliers"], products: ["Relógio automático", "Peça de ouro", "Anel de assinatura", "Relógio de coleção", "Colar de alta joalheria", "Edição numerada", "Conjunto de pedras raras", "Relógio tourbillon", "Joia de alta coleção", "Cofre de peças raras"], base: 8500},
  { id: "arte", name: "Arte e colecionáveis", stores: ["Opaline Art House", "Monarch Auctions", "Aureon Gallery", "Northstar Fine Art", "Crown Collectors", "Vértice Atelier", "Bluecrest Artifacts", "Maison Moderne", "Atlas Curated", "The Private Gallery"], products: ["Fotografia assinada", "Escultura contemporânea", "Obra emergente", "Pintura de coleção", "Peça de design raro", "Coleção de arte", "Acervo curatorial", "Obra de mestre fictício", "Galeria particular", "Coleção museológica privada"], base: 6500},
  { id: "viagens", name: "Viagens", stores: ["Monarch Journeys", "Aureon Escapes", "Northstar Travel Club", "Azure Privé", "Crown Destinations", "Opaline Getaways", "Vértice Voyages", "Atlas Concierge", "Blackline Retreats", "The Grand Itinerary"], products: ["Fim de semana premium", "Suíte presidencial", "Retiro alpino", "Safári privativo", "Cruzeiro de luxo", "Volta ao mundo", "Residência de temporada", "Expedição polar", "Concierge anual", "Roteiro global privativo"], base: 4500},
  { id: "esportes", name: "Esporte e lazer", stores: ["Apex Performance Club", "Monarch Athletics", "Crown Sporting", "Aureon Wellness", "Northstar Equestrian", "Vértice Racing", "Opaline Golf House", "Bluecrest Sports", "Summit Outdoor", "Prime Arena"], products: ["Equipamento profissional", "Bicicleta de competição", "Simulador de corrida", "Cavalo de competição", "Camarote de temporada", "Quadra particular", "Clube de golfe", "Centro equestre", "Arena esportiva", "Franquia de clube"], base: 5500},
  { id: "hospitalidade", name: "Hospitalidade", stores: ["Maison Grand Hotel", "Monarch Resorts", "Aureon Hospitality", "Northstar Suites", "Opaline Stays", "Crown Retreats", "Azure Grand Collection", "Vértice Hotels", "The Luxe Reserve", "Atlas Resorts"], products: ["Experiência gastronômica", "Suíte de assinatura", "Mesa de chef", "Cabana privativa", "Residência em resort", "Pacote de temporada", "Membro de clube privado", "Spa exclusivo", "Retiro arquitetônico", "Residência vitalícia em resort"], base: 7200},
  { id: "seguranca", name: "Serviços privados", stores: ["Aureon Concierge", "Monarch Private Office", "Crown Secure Services", "Northstar Protection", "Vértice Household", "Opaline Lifestyle", "Atlas Personal Office", "Bluecrest Management", "The Private Standard", "Summit Concierge"], products: ["Concierge por evento", "Assistência residencial", "Gestão de agenda", "Equipe de evento", "Consultoria patrimonial", "Gestão de propriedade", "Escritório pessoal", "Serviço executivo anual", "Equipe de suporte privada", "Family office personalizado"], base: 12500}
];

const tierNames = ["Standard", "Classic", "Gold", "Platinum", "Diamond", "Black", "Signature", "Deluxe", "Private", "Obsidian", "Imperial", "VIP"];
const cardFinishes = ["Édition", "Reserve", "Infinite", "Privilege", "Sovereign", "Noir"];
export const CARDS = tierNames.flatMap((tier, t) => cardFinishes.map((finish, i) => ({
  id: `card-${t}-${i}`,
  name: `${tier} ${finish}`,
  tier,
  finish,
  price: Math.round((1200 + Math.pow(t + 1, 2) * 4400) * (1 + i * 0.18)),
  limit: Math.round((12000 + Math.pow(t + 1, 2) * 140000) * (1 + i * 0.22)),
  color: ["silver", "blue", "gold", "platinum", "diamond", "black", "violet", "green", "navy", "obsidian", "imperial", "royal"][t],
  perk: ["Acesso essencial", "Benefícios de viagem", "Pontos em dobro", "Concierge prioritário", "Salas VIP", "Recompensas premium"][i]
})));

export const SHOPS = shopCategories.flatMap((category, categoryIndex) => category.stores.map((name, index) => ({
  id: `${category.id}-shop-${index + 1}`,
  name,
  categoryId: category.id,
  category: category.name,
  city: ["São Paulo", "Rio de Janeiro", "Lisboa", "Dubai", "Nova York", "Mônaco", "Zurique", "Singapura", "Londres", "Salvador"][((index + categoryIndex) % 10)],
  prestige: 1 + ((index + categoryIndex * 2) % 5),
  specialty: ["Coleção exclusiva", "Atendimento reservado", "Edições limitadas", "Curadoria premium", "Experiência sob medida"][index % 5]
})));

export const PRODUCTS = shopCategories.flatMap((category, categoryIndex) => category.products.map((name, index) => ({
  id: `${category.id}-item-${index + 1}`,
  name,
  categoryId: category.id,
  category: category.name,
  price: Math.round(category.base * Math.pow(1.72, index) * (1 + (categoryIndex % 3) * 0.17)),
  shopId: `${category.id}-shop-${(index % 10) + 1}`,
  description: ["Seleção curada para sua próxima conquista.", "Uma escolha de presença e personalidade.", "Disponível na coleção atual.", "Um item para elevar seu estilo de vida."][index % 4],
  prestige: 1 + Math.min(5, Math.floor(index / 2))
})));

export const BANK_PRODUCTS = [
  { id: "fixed-30", name: "Reserva 30 dias", type: "Prazo fixo", min: 5000, rate: 0.018, term: "30 dias", risk: "Baixo", description: "Rendimento simulado previsível." },
  { id: "fixed-90", name: "Reserva 90 dias", type: "Prazo fixo", min: 15000, rate: 0.055, term: "90 dias", risk: "Baixo", description: "Mais tempo, retorno potencial maior." },
  { id: "private-equity", name: "Private Equity", type: "Alternativo", min: 50000, rate: 0.12, term: "180 dias", risk: "Alto", description: "Participação simulada em negócios privados." },
  { id: "global-index", name: "Global Index", type: "Índice global", min: 10000, rate: 0.07, term: "90 dias", risk: "Moderado", description: "Carteira diversificada de mercados fictícios." },
  { id: "green-future", name: "Green Future", type: "Sustentabilidade", min: 2500, rate: 0.045, term: "60 dias", risk: "Moderado", description: "Projetos virtuais de energia e tecnologia limpa." },
  { id: "venture-lab", name: "Venture Lab", type: "Inovação", min: 25000, rate: 0.16, term: "120 dias", risk: "Alto", description: "Empresas emergentes do universo do jogo." }
];
export const CRYPTO = [
  { symbol: "BTC", name: "Bitcoin", price: 325000, volatility: 0.035 },
  { symbol: "ETH", name: "Ethereum", price: 18500, volatility: 0.045 },
  { symbol: "SOL", name: "Solana", price: 920, volatility: 0.065 },
  { symbol: "XRP", name: "XRP", price: 3.8, volatility: 0.055 },
  { symbol: "USDC", name: "USD Coin", price: 5.25, volatility: 0.004 },
  { symbol: "AVAX", name: "Avalanche", price: 180, volatility: 0.06 }
];
export const STORE_CATEGORIES = shopCategories.map(({ id, name }) => ({ id, name }));
