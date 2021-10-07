const configurationOptions = [
    {
        name: 'faceitKey',
        title: 'Faceit API Key',
        type: 'string',
        placeholder: 'Enter your Faceit API Key',
    },
    {
        name: 'unlinkGroups',
        title: 'Groups allowed to use the unlink command',
        type: 'array',
        vars: [
            {
                name: 'group',
                title: 'Group',
                type: 'string',
                placeholder: 'Enter the group id',
            },
        ],
    },
    {
        name: 'serverGroupToSet',
        title: 'Add Ranks',
        type: 'array',
        vars: [
            {
                name: 'serverGroup',
                title: 'Server Group',
                type: 'string',
                placeholder: 'Enter the server group to set',
            },
            {
                name: 'rank',
                title: 'Rank',
                type: 'string',
                placeholder: 'Enter the rank to set',
            },
        ],
    },
];

registerPlugin(
    {
        name: 'Faceit Ranking Script',
        version: '1.0',
        description: 'This example actually does nothing',
        author: 'Konstantin <konstantinw@ledbrain.de>',
        vars: configurationOptions,
        autorun: false,
        requiredModules: ['http'],
    },

    async (_, config, meta) => {
        const backend = require('backend');
        const engine = require('engine');
        const event = require('event');
        const store = require('store');
        const http = require('http');

        engine.log(`Loaded ${meta.name} v${meta.version} by ${meta.author}.`);

        const sendRequest = (
            /** @type {string} */ url,
            headers = {
                Authorization: `Bearer ${config.faceitKey}`,
            }
        ) => {
            return new Promise((resolve, reject) => {
                http.simpleRequest(
                    {
                        method: 'GET',
                        url,
                        headers,
                    },
                    (error, response) => {
                        if (error || response.statusCode !== 200) {
                            engine.log(
                                `${
                                    response.statusCode !== 200 ? 'HTTP ' : ''
                                }Error: ${error}`
                            );
                            reject(error);
                        } else {
                            let data;
                            try {
                                data = JSON.parse(response.data.toString());
                            } catch (error) {
                                engine.log(error.message);
                            }
                            if (data === undefined) {
                                engine.log('Invalid JSON.');
                                return;
                            }

                            resolve(data);
                        }
                    }
                );
            });
        };

        const getFaceitPlayer = async playerName => {
            const url = `https://open.faceit.com/data/v4/players?nickname=${playerName}`;
            return await sendRequest(url);
        };

        const getFaceitId = uid => {
            const key = Object.entries(store.getAll()).find(
                ([, value]) => value === uid
            )[0];
            return key.replace('faceit_', '');
        };

        const updateFaceitRanks = () => {
            /**
             * @type {Map<string, string>}
             */
            const users = store.getAll();
            const entries = Object.entries(users);

            //engine.log(JSON.stringify(config.serverGroupToSet));
            if (config.serverGroupToSet.length !== 10) {
                engine.log('❌ Error: Please enter 10 Faceit Rank groups!');
            }
            entries.forEach(async ([key, uid]) => {
                if (!key.startsWith('faceit_')) return;
                const playerId = key.replace('faceit_', '');
                const url = `https://open.faceit.com/data/v4/players/${playerId}`;
                const player = await sendRequest(url);
                try {
                    const user = backend.getClientByUID(uid);
                    if (!user) return;
                    const groupToSet = config.serverGroupToSet.find(
                        ({ rank }) =>
                            rank === player.games.csgo.skill_level.toString()
                    ).serverGroup;
                    const userGroups = user.getServerGroups();
                    const currentGroup = userGroups.find(group =>
                        config.serverGroupToSet.find(
                            ({ serverGroup }) => group.id() === serverGroup
                        )
                    );
                    if (!currentGroup) return user.addToServerGroup(groupToSet);
                    if (
                        userGroups.find(
                            group => group.id() === currentGroup.id()
                        )
                    )
                        return;
                    engine.log('after if 149');
                    user.removeFromServerGroup(currentGroup);
                    user.addToServerGroup(groupToSet);
                } catch (error) {
                    return engine.log(`❌ Error: ${error}`);
                }
                engine.log('✔ Success: Updated Roles.');
            });
        };

        if (!config.faceitKey) {
            engine.log('❌ Error: Please enter a Faceit API Key!');
            return;
        }

        if (!config.unlinkGroups) {
            engine.log('❌ Error: Please enter at least one group!');
            return;
        }

        if (!config.serverGroupToSet) {
            engine.log('❌ Error: Please enter a server group to set!');
            return;
        }
        if (config.serverGroupToSet.length !== 10) {
            engine.log('❌ Error: Please enter 10 Faceit Rank groups!');
            return;
        }

        event.on('load', () => {
            const command = require('command');
            if (!command)
                throw new Error(
                    'command.js library not found! Please download command.js and enable it to be able use this script!'
                );
            command
                .createCommand('link')
                .addArgument(args => args.string.setName('urlOrUsername'))
                .help('Link your Faceit account')
                .manual('Link your Faceit Account to your Teamspeak user')
                .exec(async (client, args, reply, ev) => {
                    if (!args.urlOrUsername) {
                        reply('❌ Usage: link <username or url>');
                        return;
                    }
                    let username = args.urlOrUsername;
                    if (args.urlOrUsername.includes('faceit.com')) {
                        username =
                            /(?<=^https?:\/\/(www\.)faceit\.com\/[a-z]{2}\/players\/).*?(?=\/?$)/.exec(
                                args.urlOrUsername.replace(
                                    /^\[URL]|\[\/URL]$/g,
                                    ''
                                )
                            )[0];
                    }
                    getFaceitPlayer(username)
                        .then(player => {
                            if (store.get(`faceit_${player.player_id}`)) {
                                reply(
                                    `❌ Error: This Faceit account is already linked!`
                                );
                                return;
                            }
                            if (!player.games || !player.games.csgo) {
                                reply(
                                    `❌ Error: This Faceit account is not linked to CSGO!`
                                );
                                return;
                            }
                            reply(`🔗 Linking ${username} to your TS3 account`);
                            store.set(
                                `faceit_${player.player_id}`,
                                client.uid()
                            );
                            return;
                        })
                        .catch(error => {
                            reply('❌ Error: Could not resolve the username!');
                            return;
                        });
                });
            command
                .createCommand('unlink')
                .addArgument(args => args.client.setName('user'))
                .help('Unlink a Faceit account')
                .manual('Unlink a Faceit account from a TS3 account')
                .checkPermission(client => {
                    const clientGroups = client
                        .getServerGroups()
                        .map(group => group.id());
                    engine.log(clientGroups);
                    engine.log(config.unlinkGroups);
                    return config.unlinkGroups.some(({ group }) =>
                        clientGroups.includes(group)
                    );
                })
                .exec(async (client, args, reply, ev) => {
                    const user = backend.getClientByUID(args.user);
                    if (!user) {
                        reply('❌ Error: Could not find the user!');
                        return;
                    }

                    const faceitId = getFaceitId(user.uid());

                    if (!faceitId) {
                        reply('❌ Error: This user is not linked!');
                        return;
                    }

                    store.unset(`faceit_${faceitId}`);
                    reply(
                        `🔗 Unlinked ${user.nick()} (${user.uid()} | Faceit ID: ${faceitId}) from Faceit`
                    );
                });
            setInterval(updateFaceitRanks, 1000 * 60 * 5); // 5 minutes
        });
    }
);
