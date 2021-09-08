const util = require('util');
const { POLL_INTERVAL, IS_CONSOLE_LOGGING } = require("../constants");
const { mailOptions, transporter } = require('../utils/email');
const childWrite = require('../writers/childWrite');
const deviceWrite = require('../writers/deviceWrite');
const isEmailing = false;

/**
 * 
 * @param {Object} stateString {
                    voltage_mv: 111399,
                    current_ma: 1651,
                    power_mw: 183194,
                    total_wh: 9465,
                    err_code: 0,
                    current: 1.651,
                    power: 183.194,
                    total: 9.465,
                    voltage: 111.399 }
 * @returns String: power: 183.194
 */
const getChildPower = (stateString) => {
    const everythingFromPowerToEnd = stateString.substr(stateString.indexOf('power:'), stateString.length - 1);
    const endOfPowerSection = everythingFromPowerToEnd.indexOf(',');
    return everythingFromPowerToEnd.substr(0, endOfPowerSection);
}

const powerStrip = (client, host) => {
    client.getDevice({ host: host })
        .then(device => {
            let summedChildrenPower = 0;
            let childIndex = 0;

            device.children?.forEach(async (child) => {
                const childPlug = await client.getDevice({ host: host, childId: child.id });

                childPlug.on('emeter-realtime-update', (emeterRealtime) => {
                    const stateString = emeterRealtime != null ? util.inspect(emeterRealtime) : undefined;
                    const watts = stateString && getChildPower(stateString);

                    if (watts === undefined) return '';
                    const power = watts.substr(watts.indexOf(':') + 2, watts.length - 1);

                    summedChildrenPower += parseInt(power);

                    const electricityData = {
                        time: Date.now(),
                        date: new Date(),
                        name: childPlug.alias,
                        DeviceModel: childPlug.model,
                        DeviceHost: childPlug.host,
                        id: childPlug.childId,
                        watts: power,
                    };

                    childWrite(electricityData, IS_CONSOLE_LOGGING);

                    childIndex += 1;
                    if (childIndex === 6) {
                        deviceWrite({
                            id: device?.id,
                            time: Date.now(),
                            date: new Date(),
                            name: `${device?.alias} - power strip`,
                            model: device?.model,
                            host: host,
                            watts: summedChildrenPower,
                            description: 'Parent Strip'
                        }, IS_CONSOLE_LOGGING);
                        summedChildrenPower = 0;
                        isEmailing && transporter.sendMail(mailOptions);
                        childIndex = 0;
                    }
                });

                childPlug.startPolling(POLL_INTERVAL);
            });
        })
        .catch(e => {
            const electricityData = {
                id: device?.id,
                time: Date.now(),
                date: new Date(),
                name: `${device?.alias} - power strip`,
                model: device?.model,
                host: host,
                watts: false,
                description: 'issue with connecting to a child or power strip itself.'
            };

            deviceWrite(electricityData, false);
        });
}


module.exports = powerStrip;