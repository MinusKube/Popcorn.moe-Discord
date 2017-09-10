import { blue, green } from 'chalk';
import { INSTANCE } from '../Modules';

export const commands = new Map();

const PREFIX = global.settings.prefix;

global.discordClient.on('message', (msg) =>
{
    if (!msg.content.startsWith(PREFIX))
        return;

    Array.from(commands.entries())
        .map(([regex, value]) => ([regex.exec(msg.content.substring(PREFIX.length)), value]))
        .filter(([res]) => res !== null)
        .forEach(([result, { value, name, target }]) => {
            console.log(blue(`Executing ${green.bold(name)}.`));
            value.apply(target[INSTANCE], [msg].concat(result.slice(1)));
        });

    for (const regex of commands.keys())
    {
        regex.lastIndex = 0;
    }
});

export default function command(regex)
{
    return (target, key, descriptor) =>
    {
        commands.set(regex, {
            name : `${target.constructor.name}.${key}`,
            target,
            value: descriptor.value
        });
        return descriptor;
    };
}