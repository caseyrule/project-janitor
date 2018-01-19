class EmptyPromise<T> implements PromiseLike<T> {
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): PromiseLike<TResult1 | TResult2> {
    return (this as any) as PromiseLike<never>;
  }
}

type PromiseProvider<T, U> = (arg?: any) => PromiseLike<U> | U;
type PromisedPredicate<T> = (arg?: any) => PromiseLike<boolean> | boolean;

export abstract class Promiser {
  public static forEach<T, U>(arr: T[], task: (t: T) => PromiseLike<U> | U) {
    let thenable: PromiseLike<any> = Promise.resolve(null);

    for (let t of arr) {
      thenable = thenable.then(() => task(t));
    }

    return thenable;
  }

  public static forAll<T, U>(arr: T[], task: (t: T) => PromiseLike<U> | U) {
    return Promise.all(arr.map(task));
  }

  public static onlyIf(pred: PromisedPredicate<any>): PromiseLike<void> {
    return Promise.resolve(pred()).then(Promiser.ifGuard);
  }

  public static logicalOr<T>(arr: T[], pred: PromisedPredicate<T>): PromiseLike<boolean> {
    let pass: boolean = false;

    return Promiser.forEach(arr, t => {
      Promiser.onlyIf(pred).then(() => {
        pass = true;
      });
    }).then(() => pass);
  }

  private static ifGuard(passed: boolean): PromiseLike<void> {
    if (passed) {
      return Promise.resolve();
    } else {
      return new EmptyPromise<void>();
    }
  }

  public static try(task: PromiseProvider<any, any>, errorHandler: (e: any) => void): PromiseLike<void> {
    try {
      Promise.resolve(task()).catch(errorHandler);
    } catch (e) {
      errorHandler(e);
      return Promise.reject(e);
    }
  }
}
