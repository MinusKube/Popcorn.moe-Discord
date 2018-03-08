import { RichEmbed } from 'discord.js';
import { client } from '../../discord';
import { command, on } from '../../decorators';
import { embeds, random, error, warn, errHandle } from '../../utils';
import YoutubeStreamer from './YoutubeStreamer';
import SoundCloudStreamer from './SoundCloudStreamer';
import ListenMoeStreamer from './ListenMoeStreamer';
import settings from './index.json';

const STREAMERS = [YoutubeStreamer, SoundCloudStreamer, ListenMoeStreamer];

export default class Music {
	constructor() {
		this.queue = new Map();
		this.volumes = new Map();
		this.lastCommand = new Map();
		this.category = {
			icon: '🎵', // :musical_note:
			name: 'Musiques',
			desc: 'Commandes relatives aux musiques'
		};
	}

	@command(/^come$/i, { name: 'come', desc: 'Connecter le bot à votre channel' })
	come({ id, member, channel }) {

		if (!member.voiceChannel)
			return channel
				.send({ embed: embeds.err("Vous n'êtes pas dans un channel!") })
				.then(msg => embeds.timeDelete(msg));

		this.queue.set(channel.guild.id, []);
		this.volumes.set(channel.guild.id, 0.1);

		return member.voiceChannel
			.join()
			.then(connection => {
				connection.playFile(random(settings.greets), { volume: 0.75 });

				const embed = new RichEmbed()
					.setTitle(`Connecté sur ${connection.channel.name}!`)
					.setColor(0x3df75f); //Todo gif :)
				return channel.send({ embed });
			});
	}

	@command(/^stop$/i, { name: 'stop', desc: 'Déconnecter le bot du salon' })
	stop({ channel }) {
		if (!channel.guild.voiceConnection)
			return channel
				.send({ embed: embeds.err("Le bot n'est connecté à aucun channel!") })
				.then(msg => embeds.timeDelete(msg));

		const promises = [];

		promises.push(channel.guild.voiceConnection.disconnect());

		const embed = new RichEmbed().setTitle('Déconnecté.').setColor(0xdb1348); //Todo gif :)
		promises.push(channel.send({ embed }));

		this.lastMessage = [];

		return Promise.all(promises);
	}

	@command(/^play (.+)$/i, { name: 'play', desc: 'Jouer la musique', usage: '[url | listen.moe]'})
	play({ member, channel }, url) {
		if (!channel.guild.voiceConnection)
			return channel
				.send({ embed: embeds.err("Le bot n'est connecté à aucun channel!") })
				.then(msg => embeds.timeDelete(msg));

		const Streamer = STREAMERS.find(s => s.isValid(url));
		if (!Streamer)
			return channel
				.send({ embed: embeds.err('Je ne comprends pas cet url') })
				.then(msg => embeds.timeDelete(msg));

		const streamer = new Streamer(member, url);

		const queue = this.queue.get(channel.guild.id);
		queue.push(streamer);

		if (queue.length - 1) {
			return streamer.embed.then(embed => {
				channel.send(
					`🎵  Ajouté à la queue (ajouté par ${
						streamer.adder.displayName
					})  🎵`,
					{ embed }
				);
			});
		} else {
			return this.next({ channel });
		}
	}

	@command(/^next$/i, { name: 'next', desc: 'Joue une musique suivante'})
	next({ channel }, volume = this.volumes.get(channel.guild.id)) {
		const queue = this.queue.get(channel.guild.id);

		if (!queue)
			return channel
				.send({ embed: embeds.err("Le bot n'est connecté à aucun channel!") })
				.then(msg => embeds.timeDelete(msg));

		if (
			channel.guild.voiceConnection &&
			channel.guild.voiceConnection.dispatcher
		)
			channel.guild.voiceConnection.dispatcher.end('next');

		const streamer = queue[0];

		if (!streamer) {
			this.volumes.set(channel.guild.id, volume);
			return client.user.setGame('');
		}


		const onMusic = () =>
			Promise.all([
				streamer.title
					.then(title => client.user.setGame('🎵 ' + title)),
				streamer.embed
					.then(embed =>
						channel.send(`🎵  Actuellement joué (ajouté par ${streamer.adder.displayName})  🎵`, { embed }))
					.then(message => this.react(message, '⏮⏹⏭⏸'.split('')))
					.then(([{ message }]) => 
						this.lastCommand.set(channel.guild.id, { messageID: message.id, command: 'next' }))
			]);

		streamer.on('music', onMusic);

		streamer.on('error', err => {
			error(err, 'Streamer error');
			channel.send({ embed: embeds.err('Erreur du streamer').setFooter(err) })
				.then(msg => embeds.timeDelete(msg))
				.catch(() => {}); //we don't care
		});

		return streamer.stream.then(stream => {
			const handler = channel.guild.voiceConnection.playStream(stream, { volume });

			handler.once('end', errHandle(reason => {
				streamer.removeListener('music', onMusic);
				queue.shift();

				if (reason !== 'next') return this.next({ channel }, handler.volume);
			}, err => {
				error(err, 'Error when playing the next music');
				channel.send({ embed: embeds.err('Erreur lors du lancement de la prochaine musique').setFooter(err) })
					.then(msg => embeds.timeDelete(msg))
					.catch(() => {}); //we don't care
			}));


			//Event handling
			handler.on('error', err => {
				error(err, 'Unexpected error on module Music');
				channel.send({ embed: embeds.err('Une erreur inattendue est survenue').setFooter(err) })
					.then(msg => embeds.timeDelete(msg))
					.catch(() => {}); //we don't care
			});

			handler.on('warn', warning => warn(warning));
		});
	}

	@command(/^skip(?: (\d+))?$/i, { name: 'skip', desc: 'Sauter n musiques de la liste', usage: '[n]'})
	skip({ channel }, num = 1) {
		if (
			!channel.guild.voiceConnection ||
			!channel.guild.voiceConnection.dispatcher
		)
			return channel
				.send({ embed: embeds.err('Le bot ne joue actuellement pas!') })
				.then(msg => embeds.timeDelete(msg));

		const queue = this.queue.get(channel.guild.id);

		const embed = new RichEmbed()
			.setTitle(`${queue.length < num ? queue.length : num} musiques passées`)
			.setColor(0xeaf73d); //Todo gif :)

		queue.splice(0, num - 1);

		channel.guild.voiceConnection.dispatcher.end();
		
		return channel.send({ embed });
	}

	@command(/^queue$/i, { name: 'queue', desc: 'Affiche les musiques dans la queue'})
	showQueue({ channel }) {
		const queue = this.queue.get(channel.guild.id);
		if (!queue)
			return channel
				.send({ embed: embeds.err('Le bot ne joue actuellement pas!') })
				.then(msg => embeds.timeDelete(msg));

		if (!queue.length) {
			const embed = new RichEmbed()
				.setTitle(`Il n'y a pas de musique dans la queue.`)
				.setColor(0xeaf73d); //Todo gif :)
			return channel.send({ embed });
		}

		channel.send('🎵  Liste des musiques dans la queue  🎵');

		return Promise.all(
			queue.map(streamer => streamer.embed.then(embed => [streamer, embed]))
		).then(p =>
			p.map(([streamer, embed], i) => {
				channel.send(
					i
						? `⏩  ${i}. Ajouté par ${streamer.adder.displayName}`
						: `▶  Actuellement joué (ajouté par ${streamer.adder.displayName})`,
					{ embed }
				);
			})
		);
	}

	@command(/^volume(?: (\d+)%?)?$/i, { name: 'volume', desc: 'Change le volume du bot (0 - 250)', usage: '[volume]'})
	volume({ channel }, percent) {
		if (!channel.guild.voiceConnection)
			return channel
				.send({ embed: embeds.err("Le bot n'est connecté à aucun channel!") })
				.then(msg => embeds.timeDelete(msg));

		if (percent < 0 || percent > 250)
			return channel
				.send({ embed: embeds.err('Impossible de définir le volume dans cet intervale') })
				.then(msg => embeds.timeDelete(msg));

		const dispatcher = channel.guild.voiceConnection.dispatcher;

		if (percent) {
			if (dispatcher) dispatcher.setVolume(percent / 100);
			else this.volumes.set(channel.guild.id, percent / 100);

			const embed = new RichEmbed()
				.setTitle(`Le volume est maintenant à ${percent}%!`)
				.setColor(0xeaf73d); //Todo gif :)
			return channel.send({ embed });
		} else {
			const volume = dispatcher
				? dispatcher.volume
				: this.volumes.get(channel.guild.id);
			const embed = new RichEmbed()
				.setTitle(`Le volume est à ${(volume * 100).toFixed(0)}%!`)
				.setColor(0xeaf73d); //Todo gif :)
			return channel.send({ embed });
		}
	}

	@command(/^clearQueue$/i, { name: 'clearQueue', desc: 'Vide la queue'})
	clearQueue({ channel }) {
		this.queue.set(channel.guild.id, []);

		channel.guild.voiceConnection &&
			channel.guild.voiceConnection.dispatcher &&
			channel.guild.voiceConnection.dispatcher.end(); //beautiful

		const embed = new RichEmbed()
			.setTitle('La queue a été vidée.')
			.setColor(0xeaf73d); //Todo gif :)
		return channel.send({ embed });
	}

	@command(/^pause$/i, { name: 'pause', desc: 'Met en pause la musique'})
	pause({ channel }, bool) {
		const dispatcher =
			channel.guild.voiceConnection && channel.guild.voiceConnection.dispatcher;
		if (!dispatcher)
			return channel
				.send({ embed: embeds.err('Le bot ne joue actuellement pas!') })
				.then(msg => embeds.timeDelete(msg));

		dispatcher.setPaused(typeof bool === 'boolean' ? bool : !dispatcher.paused);

		const embed = new RichEmbed()
			.setTitle(dispatcher.paused ? '⏸  Pause' : '▶  Repris')
			.setColor(dispatcher.paused ? 0xeaf73d : 0x3df75f); //Todo gif :)
		return channel.send({ embed });
	}

	@command(/^removeMusic(?: (\d+))?$/i, {name: 'removeMusic', desc: 'Supprime un element de la queue à un index', usage: '[index]'})
	removeMusic({ channel }, num) {
		const queue = this.queue.get(channel.guild.id);
		if (!queue)
			return channel
				.send({ embed: embeds.err('Le bot ne joue actuellement pas!') })
				.then(msg => embeds.timeDelete(msg));

		if (!num)
			return channel
				.send({
					embed: embeds.err(
						'Veuillez donner un emplacement de musique de la queue.'
					)
				})
				.then(msg => embeds.timeDelete(msg));

		const embed = new RichEmbed()
			.setTitle(`Musique supprimée de la queue`)
			.setColor(0xeaf73d); //Todo gif :)

		queue.splice(num - 1, num);

		return channel.send({ embed });
	}

	@on('messageReactionAdd')
	onReaction(reaction, user) {
		if (user.bot) return;

		const last = this.lastCommand.get(reaction.message.guild.id);
		if (!last) return;

		const { messageID, command } = last;

		if (reaction.message.id !== messageID) return;

		const ls = reactionListeners[command];

		return ls && ls[reaction.emoji] && ls[reaction.emoji].apply(this, [reaction, user]);
	}

	//Returns Promise<Array<Reaction>>
	react(message, emojis) {
		const reacts = [];
		return emojis.reduce((acc, cur) =>
			acc.then(({ message }) => message.react(cur))
				.then(react => {
					reacts.push(react);
					return react;
				}),
			Promise.resolve({ message })
		).then(() => reacts);
	}

}

const reactionListeners = {
	next: {
		// '⏮': function ({ message }, user) { message.reply('Unimplemented yet') },
		'⏹': function ({ message }, user) { return this.stop({ channel: message.channel }); },
		'⏭': function ({ message }, user) { return this.next({ channel: message.channel }); },
		'⏸': function (reaction, user) {
			return Promise.all([
				this.pause({ channel: reaction.message.channel }, true),
				reaction.message.react('▶'),
				...Array.from(reaction.users.values()).map(user => reaction.remove(user))
			]);
		},
		'▶': function (reaction, user) {
			return Promise.all([
				this.pause({ channel: reaction.message.channel }, false),
				reaction.message.react('⏸'),
				...Array.from(reaction.users.values()).map(user => reaction.remove(user))
			]);
		}
	} 
}