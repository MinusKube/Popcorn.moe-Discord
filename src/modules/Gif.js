import command from '../decorators/command';
import { embeds, members, random, load } from '../utils';
import { RichEmbed } from 'discord.js';

const settings = load('Gif.json');

const COMMAND_MATCH = '^$command(?: <@!?(\\d+)>| @(.+)#(\\d+))?';

export default class Gif {
	constructor() {
		this.category = {
			icon: '<:kannaChamp:358981430598041601>',
			name: 'GIF',
			desc: "Commandes basées sur l'envoi de gif"
		};

		this.setup();
	}

	setup() {
		Object.entries(settings).forEach(([name, cmd]) => this.setupOne(name, cmd));
	}

	setupOne(name, { desc, msg, gifs }) {
		const regex = new RegExp(COMMAND_MATCH.replace('$command', name), 'i');

		const value = (message, mention, name, id) => {
			const { member, guild } = message;

			const { from, to } =
				mention || name
					? {
							from: member,
							to: mention
								? members.byID(guild, mention)
								: members.byName(guild, name, id)
						}
					: { from: guild.me, to: member };

			return Promise.all([
				message.delete(),
				this.response(
					message,
					msg,
					gifs,
					member,
					members.byName(guild, name, id)
				)
			]);
		};

		command(regex, { name, desc, usage: '[utilisateur]' })(this, name, {
			value
		});
	}

	response(message, msg, gifs, from, to) {
		if (!to) {
			const embed = embeds.err('Aucun utilisateur trouvé 😭');

			return message.channel
				.send({ embed })
				.then(message => embeds.timeDelete(message));
		}

		const send = msg
			.replace('{0}', from.displayName)
			.replace('{1}', to.displayName);

		const embed = new RichEmbed()
			.setTitle(send)
			.setColor(0x00ae86)
			.setImage(random(gifs));

		return message.channel.send({ embed });
	}
}
