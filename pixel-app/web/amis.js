/* Les amis de Pixel (placeholder: the screens' part comes next). */
window.PixelAmis = (() => {
/* the 512 words of the friendship codes, as written (pixel/amis.py reads them from here, between the backquotes): simple
   French words a child reads and types, no two of them sounding alike; a code is three of them and a number, 1000 to 9999 */
const MOTS = `
abeille agneau aigle âne autruche baleine biche bison blaireau bourdon canard castor chameau chamois chat chaton cheval chèvre
chien chiot chouette cigale cigogne cochon colibri colombe corbeau crabe crapaud criquet crocodile dauphin dindon dragon
écureuil éléphant escargot faucon fourmi furet gazelle girafe gorille grillon guépard hamster hérisson hibou homard iguane
jaguar kangourou koala lama lapin léopard lézard licorne lion loup loutre lynx mammouth manchot marmotte merle moineau morse
mouton otarie ours panda panthère papillon perroquet pélican pieuvre pigeon pingouin pivert poney poule poulain poulet poussin
puma renard requin sanglier sardine saumon scarabée serpent singe souris suricate taupe tatou tigre tortue toucan truite vache
zèbre chenille poisson dinosaure ourson méduse crevette canari abricot ananas avocat banane beignet biscuit bonbon brioche
brocoli cacao carotte cerise chocolat citron compote concombre cookie courgette crêpe croissant fraise framboise fromage gaufre
glace haricot kiwi mangue melon miel myrtille navet noisette olive orange pastèque patate pêche poire poivron pomme popcorn
potiron prune pizza radis raisin salade sucre tarte tartine tomate vanille yaourt cornichon galette muffin nougat praline sirop
figue litchi mandarine papaye pistache quiche ravioli jambon saucisse frite flan caramel guimauve sandwich omelette spaghetti
bretzel clafoutis chips macaron chantilly fondue asperge arbre automne bambou branche buisson cactus caillou canyon cascade
colline comète corail désert éclair étoile falaise feuille fleur forêt fougère galaxie givre glacier gland grotte herbe hiver
jardin jungle lagune lune montagne mousse neige nuage océan orage palmier planète plage pluie prairie printemps rivière rocher
ruisseau saison soleil source tempête tulipe vague vallée volcan lilas muguet lavande tournesol bourgeon nénuphar mimosa pétale
racine graine étang oasis banquise iceberg ciel trèfle flocon glaçon aimant ampoule armoire assiette balai ballon bateau bougie
boussole bureau cadeau cahier camion canapé carton chaise chaussure cheminée cloche coffre collier crayon cuillère drapeau
écharpe échelle éponge fauteuil fenêtre feutre flûte fusée gant gilet guitare hamac horloge jouet journal kayak lampe lanterne
livre loupe manteau masque matelas micro miroir montre moto mouchoir oreiller panier peigne pelle piano pinceau placard plume
porte poupée puzzle radio raquette robot robinet ruban sac savon sifflet stylo table tableau tambour tapis tasse tente toboggan
toupie train trousse valise vélo violon voiture yoyo cartable règle compas luge ski patin domino bille peluche doudou tipi igloo
cabane chalet château pont tunnel fontaine statue palais cirque école musée garage grenier cuisine chambre plafond couloir volet
bouée parapluie lunette brouette arrosoir parachute boomerang kimono pyramide sabot tirelire vaisseau fanion sablier chaudron
baguette avion bus canoë métro navire paquebot radeau roller scooter taxi tracteur tram voilier wagon traîneau carrosse hélice
moteur bleu rouge jaune violet gris marron blanc doré argent cercle triangle losange cube spirale zigzag ovale musique chanson
trompette harpe grelot harmonica fanfare martien ovni soucoupe télescope satellite géant lutin pirate chevalier princesse roi
trésor couronne potion sirène elfe génie magicien tennis judo karaté danse surf voile yoga rugby basket golf marelle cerceau
corde diabolo bowling main pied oreille genou coude épaule jambe bras ventre pompier docteur facteur fermier pilote marin
peintre clown boulanger bisou câlin sourire blague surprise confetti bulle pirouette galipette acrobate carnaval parade lumière
ombre écho aventure voyage secret énigme mystère message
`.trim().split(/\s+/);
return { MOTS };
})();
