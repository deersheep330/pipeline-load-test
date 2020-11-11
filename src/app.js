const { fork } = require('child_process')
const moment = require('moment')
const { sleep } = require('./utils')
const fs = require('fs')

const args = process.argv.slice(2)
const account = args[0] || 'tester@example.com'
const password = args[1] || 'tester123'
const filename = args[2] || 'upload.csv'
const workerCount = args[3] || 10
const runtimeInMin = args[4] || 30
const runtimeInMillis = runtimeInMin * 60 * 1000

const buildVer = `TestEnv-${moment(new Date()).format('YYYYMMDD-HHmmss')}`
console.log(`==> create build: ${buildVer}`)

const records = {
    'upload': [],
    'process1': [],
    'process2': [],
    'process3': []
}

const avgs = {}
const logs = []
const errors = []

const getAvg = (arr) => {
    let sum = 0
    for (let i = 0;i < arr.length;i++) {
        sum += arr[i]
    }
    let avg = (arr.length) ? (sum / arr.length).toFixed(3) : NaN
    return avg
}

const archiveTestResults = () => {
    try {
    
        // store records per build
        if (!fs.existsSync('./archive')) {
            fs.mkdirSync('./archive')
        }
        fs.writeFileSync(`./archive/${buildVer}.json`, JSON.stringify(records))

        // store statistics (success count & average)
        if (!fs.existsSync('./output')) {
            fs.mkdirSync('./output')
        }
        
        // for count
        if (!fs.existsSync('./output/count.csv')) {
            fs.writeFileSync('./output/count.csv', 'build,upload,process1,process2,process3\n')
        }
        fs.appendFileSync('./output/count.csv', `${buildVer},${records['upload'].length},${records['process1'].length},${records['process2'].length},${records['process3'].length}\n`)


        // for average
        if (!fs.existsSync('./output/average.csv')) {
            fs.writeFileSync('./output/average.csv', 'build,upload,process1,process2,process3\n')
        }
        fs.appendFileSync('./output/average.csv', `${buildVer},${avgs['upload']},${avgs['process1']},${avgs['process2']},${avgs['process3']}\n`)

    }
    catch (err) {
        console.log(err)
    }
}

let workers = []
let workersJoined = []

const run = async () => {

    let startTime = Date.now()

    for (let workerNum = 0; workerNum < workerCount; workerNum++) {

        let worker = fork(__dirname + '/worker/worker.js', [workerNum, account, password, filename, runtimeInMillis])
        workers.push(worker)
        workersJoined.push(false)
    
        worker.on('message', (message) => {
    
            if (message.type === 'joined') { 
                workersJoined[workerNum] = true
            }
            else if (message.type === 'log') {
                logs.push(message.data)
            }
            else if (message.type === 'err') {
                errors.push(message.data)
            }
            else if (message.type === 'record') {
                for (let key in message.data) {
                    if (records.hasOwnProperty(key)) {
                        records[key].push(message.data[key] / 1000)
                    }
                }
            }
        })

        await sleep(3000)
    }

    while(true) {
        if (Date.now() - startTime > runtimeInMillis) {
            logs.push(`[${(new Date()).toLocaleTimeString()}] try to stop the test ...`)
            console.log(`[${(new Date()).toLocaleTimeString()}] try to stop the test ...`)
            for (let [workerNum, worker] of workers.entries()) {
                worker.kill()
                logs.push(`[${(new Date()).toLocaleTimeString()}] try to kill worker-${workerNum}`)
                console.log(`[${(new Date()).toLocaleTimeString()}] try to kill worker-${workerNum}`)
            }
            break
        }

        await sleep(3000)
    }

}

(async () => {
    await run()
    /*console.log(records)
    console.log(logs)
    console.log(errors)*/
    for (let key in records) {
        let avg = getAvg(records[key])
        avgs[key] = avg
    }
    archiveTestResults()
    process.exit(0)
})()