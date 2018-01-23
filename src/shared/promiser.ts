'use strict';

type Result = boolean | number | string | object | Array<any> | void;
export type Promised<T extends Result> = T | Thenable<T>;
export type Supplied<T extends Result> = T | (() => T);
export type Deferred<T extends Result> = Supplied<Promised<T>>;
export type DeferredCondition = Deferred<boolean>;
export type DeferredPredicate<T extends Result> = (arg: T) => Promised<boolean>;

/**
 * A promise that surpressed the execution of all subsequent calls to #then
 */
export class EmptyPromise<T> implements Thenable<T> {
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | Thenable<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | Thenable<TResult2>) | undefined | null
  ): Thenable<TResult1 | TResult2> {
    return (this as any) as Thenable<never>;
  }
}

export abstract class Promiser {
  public static forEach<T, U>(arr: T[], task: (t: T) => Thenable<U> | U): Thenable<U> {
    let thenable: Thenable<U> = Promise.resolve(null);

    for (let t of arr) {
      thenable = thenable.then(() => task(t));
    }

    return thenable;
  }

  public static if(pred: DeferredCondition): Thenable<void> {
    if (typeof pred === 'function') {
      return Promiser.onlyIf(pred);
    } else {
      return pred ? Promise.resolve() : new EmptyPromise<void>();
    }
  }

  public static forAll<T, U>(arr: T[], task: (t: T) => Thenable<U> | U): Thenable<U[]> {
    return Promise.all(arr.map(task));
  }

  public static ifAny<T>(arr: T[], pred: DeferredPredicate<T>): Thenable<boolean> {
    let pass = false;

    return Promiser.forEach(arr, item => {
      Promiser.onlyIf(pred, item).then(() => {
        pass = true;
      });
    }).then(() => pass);
  }

  public static ifAll<T>(arr: T[], pred: DeferredPredicate<T>): Thenable<boolean> {
    let pass = true;

    return Promiser.forEach(arr, item => {
      Promiser.onlyIfNot(pred, item).then(() => {
        pass = false;
      });
    }).then(() => pass);
  }

  private static onlyIf<T>(pred: DeferredPredicate<T>, arg?: T): Thenable<void> {
    return Promiser.resolveDeferredMapping(pred, arg).then(cond => {
      if (cond) {
        return Promise.resolve();
      } else {
        return new EmptyPromise<void>();
      }
    });
  }

  private static onlyIfNot<T>(pred: DeferredPredicate<T>, arg?: T): Thenable<void> {
    return Promiser.resolveDeferredMapping(pred, arg).then(cond => {
      if (!cond) {
        return Promise.resolve();
      } else {
        return new EmptyPromise<void>();
      }
    });
  }

  public static resolve<T>(deferred: Deferred<T>): Promise<T> {
    return Promise.resolve(Promiser.getSupplied(deferred));
  }

  public static resolveDeferredMapping<I>(deferred: DeferredPredicate<I>, arg?: I): Promise<boolean> {
    return Promiser.resolve(() => {
      return deferred(arg);
    });
  }

  private static getSupplied<T>(supplied: Supplied<T>): T {
    if (typeof supplied === 'function') {
      return (<Function>supplied)();
    } else {
      return <T>supplied;
    }
  }

  public static try(task: () => Promised<any>, errorHandler: (e: any) => void): Promised<any> {
    return new Promise((resolve, reject) => {
      try {
        resolve(task());
      } catch (e) {
        errorHandler(e);
        return reject(e);
      }
    });
  }
}
