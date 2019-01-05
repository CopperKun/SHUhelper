import {ObjectID} from "mongodb";
import {mongo} from "../../infrastructure/mongo";
import {redis} from "../../infrastructure/redis";
import * as fs from "fs";
import {Semester} from "../../../../shared/model/semester/semester";
import {DateRangeService} from "../../../../shared/model/dateRange/dateRange";

export namespace SemesterRepository {
    let currentSemester: Semester = null;

    async function cache(object: Semester) {
        let data = JSON.stringify(object);
        await redis.set('semester_' + object._id, data);
    }

    export async function getById(id: ObjectID | string): Promise<Semester | null> {
        if (typeof id === 'string') {
            id = new ObjectID(id);
        }
        const objectInBuffer = await redis.get('semester_' + id);
        if (objectInBuffer !== null) {
            return JSON.parse(objectInBuffer);
        }
        const semester = await mongo.collection('semester').findOne({_id: id});
        if (semester === null)
            return null;
        await cache(semester);
        return semester;
    }

    export async function getByName(name: string): Promise<Semester | null> {
        return await mongo.collection('semester').findOne({name: name});
    }

    export async function current(): Promise<Semester | null> {
        const now = new Date();
        if (currentSemester === null || !DateRangeService.isDateIn(currentSemester, now)) {
            currentSemester = await mongo.collection('semester').findOne({
                begin: {$lte: now},
                end: {$gt: now}
            });
        }
        return currentSemester;
    }

    export async function save(object: Semester) {
        if (object._id === null) {
            await mongo.collection('semester').insertOne(object);
        } else {
            const cachePromise = cache(object);
            const mongodbPromise = mongo.collection('semester').updateOne({_id: object._id}, {$set: object}, {upsert: true});
            await Promise.all([cachePromise, mongodbPromise]);
        }
    }
}

/**
 * 这个函数是临时的
 * 在管理员后台准备好之前将会使用json文件来初始化
 */
export async function initSemesters() {
    const data = fs.readFileSync('./initialData/semester.json');
    const json = JSON.parse(data.toString());
    for (let semester of json['semester']) {
        if ((await SemesterRepository.getByName(semester['name'])) === null) {
            semester._id = new ObjectID();
            semester.begin = new Date(semester.begin);
            semester.end = new Date(semester.end);
            for (let holiday of semester.holidays) {
                holiday.begin = new Date(holiday.begin);
                holiday.end = new Date(holiday.end);
            }
            await SemesterRepository.save(semester);
        }
    }
}