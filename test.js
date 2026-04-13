import * as fs from 'fs';
import axios from 'axios';
import ora from 'ora';

let lineStopPoints = {};  // Object to store stop points for each line

const spinner = ora('Requesting new data').start();

(async () => {
    // Get all line statuses
    const tubeLines = await axios.get('https://api.tfl.gov.uk/line/mode/tube/status');
    const lines = [{
        id: 'dlr'
    }, {
        id: 'elizabeth'
    },
    ...tubeLines.data];

    const acceptableModes = ['tube', 'dlr', 'elizabeth-line'];

    // Loop through each line
    for (const line of lines) {
        // Request the stop points for each line
        const tubeStopPoints = await axios.get(`https://api.tfl.gov.uk/line/${line.id}/stoppoints`);

        const stopPointsForLine = [];

        // Loop through each stop point and check if it's mode is tube
        for (const tubeStopPoint of tubeStopPoints.data) {
            if (acceptableModes.some(acceptableMode => tubeStopPoint.modes.includes(acceptableMode))) {
                // Add the stop point to the stop points array for the current line
                stopPointsForLine.push({
                    naptanID: tubeStopPoint.id,
                    commonName: tubeStopPoint.commonName.replace('Underground Station', '').replace(' DLR Station', '').replace('Rail Station', '').replace('Station', ''),
                });
            }
        }

        // Store stop points for this line in the object
        lineStopPoints[line.id] = stopPointsForLine;
    }

    // Write line stop points to a JSON file
    fs.writeFile('./data/lineStopPoints.json', JSON.stringify(lineStopPoints, null, 2), 'utf8', (err) => {
        if (err) {
            spinner.fail('JSON -> Data failed to update!');
        } else {
            spinner.succeed('JSON -> Data was updated successfully!');
        }
    });

    // Optional: If you want to write the raw tube lines data (not modified) to a separate JSON file
    fs.writeFile('./data/rawLines.json', JSON.stringify(tubeLines.data, null, 2), 'utf8', (err) => {
        if (err) {
            spinner.fail('Raw lines data failed to update!');
        } else {
            spinner.succeed('Raw lines data was updated successfully!');
        }
    });

})();

spinner.clear();