interface Log {
    message: string,
    date: Date
}
interface Player {
    name: string,
    xuid: string
}
interface PlayerJoinLog extends Log {
    player: Player
}
interface PlayerLeaveLog extends Log {
    player: Player
}
interface InfoLog extends Log {}
enum Status {
    started,
    stopped
}
interface StatusChangeLog extends Log {
    status: Status
    //previousStatus: Status
}

class LogParser {
    parseLog() {
        
    }
}